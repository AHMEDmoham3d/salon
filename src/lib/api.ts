
import {
  supabase,
  type Customer,
  type Subscription,
  type Visit,
  type Plan,
  type PaymentType,
  REGULAR_HAIRCUT_PRICE,
  COMPANY_FEE_PER_VISIT,
} from './supabase';

export type {
  Customer,
  Subscription,
  Visit,
  Plan,
  PaymentType,
};

export { COMPANY_FEE_PER_VISIT };

export type PaymentMethod =
  | 'cash'
  | 'instapay'
  | 'vodafone_cash'
  | 'card';

export type PaymentTransaction = {
  id: string;
  shop_id: string | null;
  customer_id: string | null;
  visit_id: string | null;
  subscription_id: string | null;
  payment_kind: 'visit' | 'subscription' | 'other';
  amount: number;
  payment_method: PaymentMethod | 'unknown';
  payment_status: 'recorded' | 'refunded' | 'void';
  payment_date: string;
  notes: string | null;
  external_reference: string | null;
  created_at: string;
};

export async function getPlans(shopId?: string): Promise<Plan[]> {
  let query = supabase
    .from('plans')
    .select('*')
    .eq('is_active', true);

  if (shopId) {
    query = query.eq('shop_id', shopId);
  } else {
    query = query.is('shop_id', null);
  }

  const { data, error } = await query.order('price', {
    ascending: true,
  });

  if (error) throw error;

  return data ?? [];
}

export async function getShopRegularHaircutPrice(
  shopId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('shops')
    .select('regular_haircut_price')
    .eq('id', shopId)
    .single();

  if (error) throw error;

  const price = Number(data?.regular_haircut_price);

  return Number.isFinite(price) && price >= 0
    ? price
    : REGULAR_HAIRCUT_PRICE;
}

export async function getCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data ?? [];
}

export async function searchCustomersByName(
  name: string
): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .ilike('name', `%${name}%`)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data ?? [];
}

export async function loginCustomer(
  name: string,
  phone: string
): Promise<{ customer: Customer; blocked: boolean } | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .ilike('name', name.trim())
    .eq('phone', phone.trim())
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    customer: data,
    blocked: !!data.is_blocked,
  };
}

export async function getCustomerById(
  id: string
): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;

  return data;
}

export async function createCustomer(
  name: string,
  phone?: string,
  notes?: string,
  shopId?: string
): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      name,
      phone: phone || null,
      notes: notes || null,
      shop_id: shopId || null,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function updateCustomer(
  id: string,
  updates: Partial<Pick<Customer, 'name' | 'phone' | 'notes'>>
): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}

/**
 * WhatsApp receipt consent is shared across this customer's shop records
 * when the same phone number is used in multiple shops.
 */
export async function getWhatsAppReceiptConsent(
  phone: string
): Promise<boolean> {
  const normalizedPhone = phone.trim();

  if (!normalizedPhone) return false;

  const { data, error } = await supabase
    .from('customers')
    .select('whatsapp_transactional_opt_in')
    .eq('phone', normalizedPhone);

  if (error) throw error;

  return (data ?? []).some(
    (row) => row.whatsapp_transactional_opt_in === true
  );
}

export async function updateWhatsAppReceiptConsent(
  phone: string,
  enabled: boolean
): Promise<void> {
  const normalizedPhone = phone.trim();

  if (!normalizedPhone) {
    throw new Error('رقم الهاتف غير متاح');
  }

  const now = new Date().toISOString();

  const updates = enabled
    ? {
        whatsapp_transactional_opt_in: true,
        whatsapp_opt_in_at: now,
        whatsapp_opt_in_source: 'customer_profile',
        whatsapp_opt_out_at: null,
      }
    : {
        whatsapp_transactional_opt_in: false,
        whatsapp_opt_out_at: now,
      };

  const { error } = await supabase
    .from('customers')
    .update(updates)
    .eq('phone', normalizedPhone);

  if (error) throw error;
}

export async function getActiveSubscription(
  customerId: string
): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, plan:plans(*)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const today = new Date().toISOString().slice(0, 10);

  if (data.status === 'active' && data.end_date < today) {
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('id', data.id);

    if (updateError) throw updateError;

    return {
      ...data,
      status: 'expired',
    };
  }

  return data;
}

export async function getSubscriptionsByCustomer(
  customerId: string
): Promise<Subscription[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, plan:plans(*)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data ?? [];
}

/**
 * Creates a subscription and records its full payment.
 *
 * The subscription is created only with a full payment.
 * The payment method defaults to cash until the Admin UI passes
 * the method selected by the shop owner.
 */
export async function createSubscription(
  customerId: string,
  planId: string,
  shopId?: string,
  paymentMethod: PaymentMethod = 'cash'
): Promise<Subscription> {
  let planQuery = supabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .eq('is_active', true);

  if (shopId) {
    planQuery = planQuery.eq('shop_id', shopId);
  } else {
    planQuery = planQuery.is('shop_id', null);
  }

  const { data: plan, error: planError } =
    await planQuery.maybeSingle();

  if (planError) throw planError;

  if (!plan) {
    throw new Error('الباقة غير موجودة أو لا تتبع هذا المحل');
  }

  const amount = Number(plan.price);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('سعر الباقة غير صحيح، لا يمكن تفعيل الاشتراك');
  }

  const start = new Date();
  const end = new Date(start);

  end.setDate(end.getDate() + Number(plan.duration_days));

  const { data: subscription, error: subscriptionError } =
    await supabase
      .from('subscriptions')
      .insert({
        customer_id: customerId,
        plan_id: planId,
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
        haircuts_used: 0,
        status: 'active',
        shop_id: shopId ?? null,
      })
      .select('*, plan:plans(*)')
      .single();

  if (subscriptionError) throw subscriptionError;

  const { error: paymentError } = await supabase
    .from('payment_transactions')
    .insert({
      shop_id: shopId ?? null,
      customer_id: customerId,
      subscription_id: subscription.id,
      payment_kind: 'subscription',
      amount,
      payment_method: paymentMethod,
      payment_status: 'recorded',
      payment_date: new Date().toISOString(),
      notes: `تحصيل كامل قيمة الاشتراك: ${plan.name}`,
    });

  if (paymentError) {
    const { error: rollbackError } = await supabase
      .from('subscriptions')
      .delete()
      .eq('id', subscription.id);

    if (rollbackError) {
      throw new Error(
        `فشل تسجيل دفعة الاشتراك، وفشل التراجع عن الاشتراك أيضًا. ` +
        `خطأ الدفع: ${paymentError.message}. ` +
        `خطأ التراجع: ${rollbackError.message}`
      );
    }

    throw new Error(
      `لم يتم تفعيل الاشتراك لأن تسجيل الدفعة فشل: ${paymentError.message}`
    );
  }

  return subscription;
}

export async function getVisitsByCustomer(
  customerId: string
): Promise<Visit[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('*')
    .eq('customer_id', customerId)
    .order('visit_date', { ascending: false });

  if (error) throw error;

  return data ?? [];
}

/**
 * Loads subscriptions and visits in batches.
 * Customers passed to this function should already be shop-scoped.
 */
export async function getShopActivityData(
  customers: Customer[],
  options: {
    includeSubscriptions?: boolean;
    includeVisits?: boolean;
    visitsSince?: string;
  } = {}
): Promise<{ subscriptions: Subscription[]; visits: Visit[] }> {
  const customerIds = customers.map((customer) => customer.id);

  if (customerIds.length === 0) {
    return {
      subscriptions: [],
      visits: [],
    };
  }

  const includeSubscriptions =
    options.includeSubscriptions !== false;

  const includeVisits =
    options.includeVisits !== false;

  const idBatches: string[][] = [];

  for (let i = 0; i < customerIds.length; i += 100) {
    idBatches.push(customerIds.slice(i, i + 100));
  }

  const loadSubscriptions = async (): Promise<Subscription[]> => {
    const results = await Promise.all(
      idBatches.map(async (ids) => {
        const rows: Subscription[] = [];

        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase
            .from('subscriptions')
            .select('*, plan:plans(*)')
            .in('customer_id', ids)
            .order('created_at', { ascending: false })
            .range(from, from + 999);

          if (error) throw error;

          const page = (data ?? []) as Subscription[];

          rows.push(...page);

          if (page.length < 1000) break;
        }

        return rows;
      })
    );

    return results.flat();
  };

  const loadVisits = async (): Promise<Visit[]> => {
    const results = await Promise.all(
      idBatches.map(async (ids) => {
        const rows: Visit[] = [];

        for (let from = 0; ; from += 1000) {
          let query = supabase
            .from('visits')
            .select('*')
            .in('customer_id', ids)
            .order('visit_date', { ascending: false });

          if (options.visitsSince) {
            query = query.gte(
              'visit_date',
              options.visitsSince
            );
          }

          const { data, error } = await query.range(
            from,
            from + 999
          );

          if (error) throw error;

          const page = (data ?? []) as Visit[];

          rows.push(...page);

          if (page.length < 1000) break;
        }

        return rows;
      })
    );

    return results.flat();
  };

  const [subscriptions, visits] = await Promise.all([
    includeSubscriptions
      ? loadSubscriptions()
      : Promise.resolve([]),
    includeVisits
      ? loadVisits()
      : Promise.resolve([]),
  ]);

  return {
    subscriptions,
    visits,
  };
}

export type RecordVisitResult = {
  visit: Visit;
  subscription: Subscription | null;
  coveredBySubscription: boolean;
};

export type RecordVisitOptions = {
  haircutType?: string;
  notes?: string;
  forcePaid?: boolean;
  customCharge?: number;
  shopId?: string;
  paymentMethod?: PaymentMethod;
};

/**
 * Creates a visit covered by a subscription or a normal paid visit.
 * Subscription-covered visits do not create another payment transaction.
 * Regular visits create a payment transaction linked to the visit.
 */
async function createVisitRecord(
  customerId: string,
  visitDate: string,
  opts: RecordVisitOptions
): Promise<RecordVisitResult> {
  const sub = opts.shopId
    ? await getShopActiveSubscription(opts.shopId, customerId)
    : await getActiveSubscription(customerId);

  const canUseSubscription =
    !opts.forcePaid &&
    sub !== null &&
    sub.status === 'active' &&
    sub.haircuts_used < (sub.plan?.haircut_count ?? 0);

  if (canUseSubscription && sub) {
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .insert({
        customer_id: customerId,
        subscription_id: sub.id,
        payment_type: 'subscription',
        haircut_type: opts.haircutType ?? null,
        charge_amount: 0,
        notes: opts.notes ?? null,
        visit_date: visitDate,
        shop_id: opts.shopId ?? null,
      })
      .select('*')
      .single();

    if (visitError) throw visitError;

    const { data: updatedSubscription, error: subscriptionError } =
      await supabase
        .from('subscriptions')
        .update({
          haircuts_used: sub.haircuts_used + 1,
        })
        .eq('id', sub.id)
        .select('*, plan:plans(*)')
        .single();

    if (subscriptionError) {
      await supabase
        .from('visits')
        .delete()
        .eq('id', visit.id);

      throw subscriptionError;
    }

    return {
      visit,
      subscription: updatedSubscription,
      coveredBySubscription: true,
    };
  }

  const defaultCharge = opts.shopId
    ? await getShopRegularHaircutPrice(opts.shopId)
    : REGULAR_HAIRCUT_PRICE;

  const charge = Number(
    opts.customCharge ?? defaultCharge
  );

  if (!Number.isFinite(charge) || charge <= 0) {
    throw new Error('قيمة الحلاقة غير صحيحة');
  }

  const { data: visit, error: visitError } = await supabase
    .from('visits')
    .insert({
      customer_id: customerId,
      subscription_id: null,
      payment_type: 'paid',
      haircut_type: opts.haircutType ?? null,
      charge_amount: charge,
      notes: opts.notes ?? null,
      visit_date: visitDate,
      shop_id: opts.shopId ?? null,
    })
    .select('*')
    .single();

  if (visitError) throw visitError;

  const { error: paymentError } = await supabase
    .from('payment_transactions')
    .insert({
      shop_id: opts.shopId ?? null,
      customer_id: customerId,
      visit_id: visit.id,
      payment_kind: 'visit',
      amount: charge,
      payment_method: opts.paymentMethod ?? 'cash',
      payment_status: 'recorded',
      payment_date: visitDate,
      notes: 'تحصيل قيمة حلاقة عادية',
    });

  if (paymentError) {
    const { error: rollbackError } = await supabase
      .from('visits')
      .delete()
      .eq('id', visit.id);

    if (rollbackError) {
      throw new Error(
        `تم تسجيل الزيارة لكن فشل تسجيل التحصيل، وفشل التراجع عن الزيارة أيضًا. ` +
        `خطأ الدفع: ${paymentError.message}. ` +
        `خطأ التراجع: ${rollbackError.message}`
      );
    }

    throw new Error(
      `لم يتم تسجيل الزيارة لأن تسجيل التحصيل فشل: ${paymentError.message}`
    );
  }

  return {
    visit,
    subscription: sub,
    coveredBySubscription: false,
  };
}

export async function recordVisitAt(
  customerId: string,
  visitDate: string,
  opts: RecordVisitOptions
): Promise<RecordVisitResult> {
  return createVisitRecord(customerId, visitDate, opts);
}

export async function recordVisit(
  customerId: string,
  opts: RecordVisitOptions
): Promise<RecordVisitResult> {
  return createVisitRecord(
    customerId,
    new Date().toISOString(),
    opts
  );
}

export async function deleteVisit(
  visitId: string
): Promise<void> {
  const { error } = await supabase
    .from('visits')
    .delete()
    .eq('id', visitId);

  if (error) throw error;
}

export async function supabaseUpdateSubscriptionUsage(
  subscriptionId: string,
  haircutsUsed: number
): Promise<void> {
  const { error } = await supabase
    .from('subscriptions')
    .update({
      haircuts_used: haircutsUsed,
    })
    .eq('id', subscriptionId);

  if (error) throw error;
}

export async function blockCustomer(
  customerId: string
): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({ is_blocked: true })
    .eq('id', customerId);

  if (error) throw error;
}

export async function unblockCustomer(
  customerId: string
): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({ is_blocked: false })
    .eq('id', customerId);

  if (error) throw error;
}

export async function deleteCustomer(
  customerId: string
): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', customerId);

  if (error) throw error;
}

export type RevenueStats = {
  totalVisits: number;
  subscriptionVisits: number;
  paidVisits: number;
  revenueFromSubscriptions: number;
  revenueFromPaid: number;
  totalRevenue: number;
  companyFee: number;
  netRevenue: number;
  thisMonthVisits: number;
  thisMonthCompanyFee: number;
};

/**
 * Returns recorded payments, plus legacy revenue for old records
 * that do not yet have a linked payment transaction.
 *
 * A transaction with refunded or void status still marks its linked
 * record as migrated, so the old amount is not counted again.
 */
export async function getRevenueStats(
  customers: Customer[]
): Promise<RevenueStats> {
  const { subscriptions, visits } =
    await getShopActivityData(customers);

  const customerIds = customers.map(
    (customer) => customer.id
  );

  const batches: string[][] = [];

  for (let i = 0; i < customerIds.length; i += 100) {
    batches.push(customerIds.slice(i, i + 100));
  }

  const transactionResults = await Promise.all(
    batches.map(async (ids) => {
      const rows: PaymentTransaction[] = [];

      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('payment_transactions')
          .select('*')
          .in('customer_id', ids)
          .order('payment_date', { ascending: false })
          .range(from, from + 999);

        if (error) throw error;

        const page = (data ?? []) as PaymentTransaction[];

        rows.push(...page);

        if (page.length < 1000) break;
      }

      return rows;
    })
  );

  const transactions = transactionResults.flat();

  const transactionVisitIds = new Set(
    transactions
      .map((transaction) => transaction.visit_id)
      .filter((id): id is string => Boolean(id))
  );

  const transactionSubscriptionIds = new Set(
    transactions
      .map((transaction) => transaction.subscription_id)
      .filter((id): id is string => Boolean(id))
  );

  const recordedTransactions = transactions.filter(
    (transaction) =>
      transaction.payment_status === 'recorded'
  );

  const transactionVisitRevenue = recordedTransactions
    .filter(
      (transaction) =>
        transaction.payment_kind === 'visit'
    )
    .reduce(
      (sum, transaction) =>
        sum + Number(transaction.amount),
      0
    );

  const transactionSubscriptionRevenue = recordedTransactions
    .filter(
      (transaction) =>
        transaction.payment_kind === 'subscription'
    )
    .reduce(
      (sum, transaction) =>
        sum + Number(transaction.amount),
      0
    );

  const legacyPaidVisits = visits.filter(
    (visit) =>
      visit.payment_type === 'paid' &&
      !transactionVisitIds.has(visit.id)
  );

  const legacySubscriptions = subscriptions.filter(
    (subscription) =>
      (subscription.status === 'active' ||
        subscription.status === 'expired') &&
      !transactionSubscriptionIds.has(subscription.id)
  );

  const revenueFromPaid =
    transactionVisitRevenue +
    legacyPaidVisits.reduce(
      (sum, visit) =>
        sum + Number(visit.charge_amount),
      0
    );

  const revenueFromSubscriptions =
    transactionSubscriptionRevenue +
    legacySubscriptions.reduce(
      (sum, subscription) =>
        sum + Number(subscription.plan?.price ?? 0),
      0
    );

  const totalVisits = visits.length;

  const subscriptionVisits = visits.filter(
    (visit) => visit.payment_type === 'subscription'
  ).length;

  const paidVisits = visits.filter(
    (visit) => visit.payment_type === 'paid'
  ).length;

  const now = new Date();

  const monthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

  const thisMonthVisits = visits.filter(
    (visit) =>
      new Date(visit.visit_date).getTime() >=
      monthStart.getTime()
  ).length;

  const totalRevenue =
    revenueFromPaid + revenueFromSubscriptions;

  const companyFee =
    totalVisits * COMPANY_FEE_PER_VISIT;

  const thisMonthCompanyFee =
    thisMonthVisits * COMPANY_FEE_PER_VISIT;

  const netRevenue = totalRevenue - companyFee;

  return {
    totalVisits,
    subscriptionVisits,
    paidVisits,
    revenueFromSubscriptions,
    revenueFromPaid,
    totalRevenue,
    companyFee,
    netRevenue,
    thisMonthVisits,
    thisMonthCompanyFee,
  };
}

export type SubscriptionAlert = {
  customer: Customer;
  subscription: Subscription;
  daysLeft: number;
  haircutsRemaining: number;
  isExpired: boolean;
  expiredDaysAgo: number;
};

export async function getSubscriptionAlerts(
  customers: Customer[]
): Promise<SubscriptionAlert[]> {
  const { subscriptions } = await getShopActivityData(
    customers,
    { includeVisits: false }
  );

  const customerById = new Map(
    customers.map((customer) => [
      customer.id,
      customer,
    ])
  );

  const latestByCustomer = new Map<
    string,
    Subscription
  >();

  for (const subscription of subscriptions) {
    if (
      !latestByCustomer.has(subscription.customer_id)
    ) {
      latestByCustomer.set(
        subscription.customer_id,
        subscription
      );
    }
  }

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const alerts: SubscriptionAlert[] = [];

  for (const subscription of latestByCustomer.values()) {
    if (subscription.status === 'cancelled') continue;

    const customer = customerById.get(
      subscription.customer_id
    );

    if (!customer) continue;

    const endDate = new Date(
      `${subscription.end_date}T00:00:00`
    );

    const daysLeft = Math.ceil(
      (endDate.getTime() - today.getTime()) /
      86400000
    );

    if (daysLeft > 7) continue;

    const haircutsRemaining =
      (subscription.plan?.haircut_count ?? 0) -
      subscription.haircuts_used;

    const isExpired = daysLeft < 0;

    alerts.push({
      customer,
      subscription,
      daysLeft,
      haircutsRemaining,
      isExpired,
      expiredDaysAgo: isExpired
        ? Math.abs(daysLeft)
        : 0,
    });
  }

  alerts.sort(
    (a, b) => a.daysLeft - b.daysLeft
  );

  return alerts;
}

export type CustomerStats = {
  totalVisits: number;
  totalPaid: number;
  subscriptionVisits: number;
  paidVisits: number;
};

export async function getCustomerStats(
  customerId: string
): Promise<CustomerStats> {
  const visits = await getVisitsByCustomer(customerId);

  return {
    totalVisits: visits.length,

    totalPaid: visits
      .filter(
        (visit) => visit.payment_type === 'paid'
      )
      .reduce(
        (sum, visit) =>
          sum + Number(visit.charge_amount),
        0
      ),

    subscriptionVisits: visits.filter(
      (visit) =>
        visit.payment_type === 'subscription'
    ).length,

    paidVisits: visits.filter(
      (visit) => visit.payment_type === 'paid'
    ).length,
  };
}

export async function getShopCustomers(
  shopId: string
): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data ?? [];
}

export async function searchShopCustomersByName(
  shopId: string,
  name: string
): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('shop_id', shopId)
    .ilike('name', `%${name}%`)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data ?? [];
}

export async function loginShopCustomer(
  shopId: string,
  name: string,
  phone: string
): Promise<{ customer: Customer; blocked: boolean } | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('shop_id', shopId)
    .ilike('name', name.trim())
    .eq('phone', phone.trim())
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    customer: data,
    blocked: !!data.is_blocked,
  };
}

export async function getShopVisitsByCustomer(
  shopId: string,
  customerId: string
): Promise<Visit[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('*')
    .eq('customer_id', customerId)
    .eq('shop_id', shopId)
    .order('visit_date', { ascending: false });

  if (error) throw error;

  return data ?? [];
}

export async function getShopActiveSubscription(
  shopId: string,
  customerId: string
): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, plan:plans(*)')
    .eq('customer_id', customerId)
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const today = new Date().toISOString().slice(0, 10);

  if (
    data.status === 'active' &&
    data.end_date < today
  ) {
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('id', data.id);

    if (updateError) throw updateError;

    return {
      ...data,
      status: 'expired' as Subscription['status'],
    };
  }

  return data;
}

export async function getShopSubscriptionsByCustomer(
  shopId: string,
  customerId: string
): Promise<Subscription[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, plan:plans(*)')
    .eq('customer_id', customerId)
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data ?? [];
}

export type CustomerInShop = {
  customer: Customer;
  shop_id: string;
  shop_name: string;
  blocked: boolean;
};

export async function findCustomerInShops(
  name: string,
  phone: string,
  shops: { id: string; shop_name: string }[]
): Promise<CustomerInShop[]> {
  if (shops.length === 0) return [];

  const results: CustomerInShop[] = [];

  for (const shop of shops) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('shop_id', shop.id)
      .ilike('name', name.trim())
      .eq('phone', phone.trim())
      .maybeSingle();

    if (error) continue;

    if (data) {
      results.push({
        customer: data,
        shop_id: shop.id,
        shop_name: shop.shop_name,
        blocked: !!data.is_blocked,
      });
    }
  }

  return results;
}

export function formatPrice(n: number): string {
  return (
    new Intl.NumberFormat('ar-EG', {
      maximumFractionDigits: 0,
    }).format(n) + ' ج.م'
  );
}

export function formatDate(
  d: string | Date
): string {
  const date =
    typeof d === 'string' ? new Date(d) : d;

  return new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(
  d: string | Date
): string {
  const date =
    typeof d === 'string' ? new Date(d) : d;

  return new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
