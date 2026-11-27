import {
  supabase,
  type Customer,
  type Subscription,
  type Visit,
  type Plan,
  type PlanItemType,
  type PaymentType,
  type Booking,
  type BookingStatus,
  REGULAR_HAIRCUT_PRICE,
  COMPANY_FEE_PER_VISIT,
} from './supabase';
import { triggerBookingPushNotification } from './bookingPush';

export type {
  Customer,
  Subscription,
  Visit,
  Plan,
  PlanItemType,
  PaymentType,
  Booking,
  BookingStatus,
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
  company_fee_amount: number;
  service_name: string | null;
  payment_method: PaymentMethod | 'unknown';
  payment_status: 'recorded' | 'refunded' | 'void';
  payment_date: string;
  notes: string | null;
  external_reference: string | null;
  created_at: string;
};

export async function getPlans(
  shopId?: string,
  itemType?: PlanItemType
): Promise<Plan[]> {
  let query = supabase
    .from('plans')
    .select('*')
    .eq('is_active', true);

  if (shopId) {
    query = query.eq('shop_id', shopId);
  } else {
    query = query.is('shop_id', null);
  }

  if (itemType) {
    query = query.eq('item_type', itemType);
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
      company_fee_amount: Number(plan.haircut_count) * COMPANY_FEE_PER_VISIT,
      service_name: null,
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

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

/**
 * Loads subscriptions and visits strictly isolated to shopId when provided.
 * Never mixes null shop_id rows or other shops' records into a specific shop.
 */
export async function getShopActivityData(
  customers: Customer[],
  options: {
    includeSubscriptions?: boolean;
    includeVisits?: boolean;
    visitsSince?: string;
    shopId?: string;
  } = {}
): Promise<{ subscriptions: Subscription[]; visits: Visit[] }> {
  const shopId = options.shopId ?? customers[0]?.shop_id ?? undefined;
  const customerIds = customers.map((customer) => customer.id);

  if (!shopId && customerIds.length === 0) {
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
    if (shopId) {
      const collected: Subscription[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('*, plan:plans(*)')
          .eq('shop_id', shopId)
          .order('created_at', { ascending: false })
          .range(from, from + 999);

        if (error) throw error;
        const page = (data ?? []) as Subscription[];
        collected.push(...page);
        if (page.length < 1000) break;
      }
      return dedupeById(collected);
    }

    const byCustomers = await Promise.all(
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
    return dedupeById(byCustomers.flat());
  };

  const loadVisits = async (): Promise<Visit[]> => {
    if (shopId) {
      const collected: Visit[] = [];
      for (let from = 0; ; from += 1000) {
        let query = supabase
          .from('visits')
          .select('*')
          .eq('shop_id', shopId)
          .order('visit_date', { ascending: false });

        if (options.visitsSince) {
          query = query.gte('visit_date', options.visitsSince);
        }

        const { data, error } = await query.range(from, from + 999);
        if (error) throw error;
        const page = (data ?? []) as Visit[];
        collected.push(...page);
        if (page.length < 1000) break;
      }
      return dedupeById(collected);
    }

    const byCustomers = await Promise.all(
      idBatches.map(async (ids) => {
        const rows: Visit[] = [];
        for (let from = 0; ; from += 1000) {
          let query = supabase
            .from('visits')
            .select('*')
            .in('customer_id', ids)
            .order('visit_date', { ascending: false });

          if (options.visitsSince) {
            query = query.gte('visit_date', options.visitsSince);
          }

          const { data, error } = await query.range(from, from + 999);
          if (error) throw error;
          const page = (data ?? []) as Visit[];
          rows.push(...page);
          if (page.length < 1000) break;
        }
        return rows;
      })
    );
    return dedupeById(byCustomers.flat());
  };

  const [subscriptions, visits] = await Promise.all([
    includeSubscriptions ? loadSubscriptions() : Promise.resolve([]),
    includeVisits ? loadVisits() : Promise.resolve([]),
  ]);

  return {
    subscriptions,
    visits,
  };
}

export async function getShopPaymentTransactions(
  shopId: string | undefined,
  customerIds: string[]
): Promise<PaymentTransaction[]> {
  if (shopId) {
    const collected: PaymentTransaction[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('shop_id', shopId)
        .order('payment_date', { ascending: false })
        .range(from, from + 999);

      if (error) throw error;
      const page = (data ?? []) as PaymentTransaction[];
      collected.push(...page);
      if (page.length < 1000) break;
    }
    return dedupeById(collected);
  }

  if (customerIds.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < customerIds.length; i += 100) {
    batches.push(customerIds.slice(i, i + 100));
  }

  const byCustomers = await Promise.all(
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

  return dedupeById(byCustomers.flat());
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
  serviceName?: string;
};

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

    const extraServiceAmount = Number(opts.customCharge ?? 0);

    if (!Number.isFinite(extraServiceAmount) || extraServiceAmount < 0) {
      await supabase.from('subscriptions')
        .update({ haircuts_used: sub.haircuts_used })
        .eq('id', sub.id);
      await supabase.from('visits').delete().eq('id', visit.id);
      throw new Error('قيمة الخدمة الإضافية غير صحيحة');
    }

    if (extraServiceAmount > 0) {
      const { error: extraPaymentError } = await supabase
        .from('payment_transactions')
        .insert({
          shop_id: opts.shopId ?? null,
          customer_id: customerId,
          visit_id: visit.id,
          payment_kind: 'visit',
          amount: extraServiceAmount,
          company_fee_amount: 0,
          service_name: opts.serviceName ?? opts.haircutType ?? 'خدمة إضافية',
          payment_method: opts.paymentMethod ?? 'cash',
          payment_status: 'recorded',
          payment_date: visitDate,
          notes: 'تحصيل خدمة إضافية أثناء استخدام الباقة',
        });

      if (extraPaymentError) {
        await supabase.from('subscriptions')
          .update({ haircuts_used: sub.haircuts_used })
          .eq('id', sub.id);
        await supabase.from('visits').delete().eq('id', visit.id);
        throw new Error(`لم يتم تسجيل الخدمة الإضافية: ${extraPaymentError.message}`);
      }
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
      company_fee_amount: COMPANY_FEE_PER_VISIT,
      service_name: opts.serviceName ?? opts.haircutType ?? 'خدمة',
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
  const { error: paymentDeleteError } = await supabase
    .from('payment_transactions')
    .delete()
    .eq('visit_id', visitId);

  if (paymentDeleteError) throw paymentDeleteError;

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
  companyFeeUnits: number;
  thisMonthCompanyFeeUnits: number;
};

export async function getRevenueStats(
  customers: Customer[],
  shopId?: string
): Promise<RevenueStats> {
  const effectiveShopId = shopId ?? customers[0]?.shop_id ?? undefined;
  const { subscriptions, visits } =
    await getShopActivityData(customers, { shopId: effectiveShopId });

  const customerIds = customers.map(
    (customer) => customer.id
  );

  const transactions = await getShopPaymentTransactions(
    effectiveShopId,
    customerIds
  );

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

  const legacyCompanyFee =
    legacyPaidVisits.length * COMPANY_FEE_PER_VISIT +
    legacySubscriptions.reduce(
      (sum, subscription) =>
        sum + Number(subscription.plan?.haircut_count ?? 0) * COMPANY_FEE_PER_VISIT,
      0
    );

  const recordedCompanyFee = recordedTransactions.reduce(
    (sum, transaction) =>
      sum + Number(transaction.company_fee_amount ?? 0),
    0
  );

  const companyFee = recordedCompanyFee + legacyCompanyFee;

  const companyFeeUnits =
    (recordedCompanyFee + legacyCompanyFee) / COMPANY_FEE_PER_VISIT;

  const monthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1
  );

  const thisMonthRecordedCompanyFee = recordedTransactions
    .filter((transaction) => {
      const paymentTime = new Date(transaction.payment_date).getTime();
      return paymentTime >= monthStart.getTime() && paymentTime < monthEnd.getTime();
    })
    .reduce(
      (sum, transaction) =>
        sum + Number(transaction.company_fee_amount ?? 0),
      0
    );

  const thisMonthLegacyCompanyFee =
    legacyPaidVisits
      .filter((visit) => {
        const time = new Date(visit.visit_date).getTime();
        return time >= monthStart.getTime() && time < monthEnd.getTime();
      }).length * COMPANY_FEE_PER_VISIT +
    legacySubscriptions
      .filter((subscription) => {
        const time = new Date(subscription.created_at).getTime();
        return time >= monthStart.getTime() && time < monthEnd.getTime();
      })
      .reduce(
        (sum, subscription) =>
          sum + Number(subscription.plan?.haircut_count ?? 0) * COMPANY_FEE_PER_VISIT,
        0
      );

  const thisMonthCompanyFee =
    thisMonthRecordedCompanyFee + thisMonthLegacyCompanyFee;

  const thisMonthCompanyFeeUnits =
    thisMonthCompanyFee / COMPANY_FEE_PER_VISIT;

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
    companyFeeUnits,
    thisMonthCompanyFeeUnits,
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
  customers: Customer[],
  shopId?: string
): Promise<SubscriptionAlert[]> {
  const effectiveShopId = shopId ?? customers[0]?.shop_id ?? undefined;
  const { subscriptions } = await getShopActivityData(
    customers,
    { includeVisits: false, shopId: effectiveShopId }
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

/* ============================================================================
 * Smart Booking System (Customer Self-Booking + Anti-No-Show + Push Alerts)
 * ============================================================================ */

export type BookingSlot = {
  start_at: string;
  end_at: string;
  label: string;
  available: boolean;
};

export type CustomerBookingTrust = {
  hasActiveSubscription: boolean;
  completedBookings: number;
  completedVisits: number;
  noShowCount: number;
  lateCancelledCount: number;
  isTrusted: boolean;
  trustBadge: string;
  canBook: boolean;
  blockReason?: string;
};

export async function evaluateCustomerBookingTrust(
  shopId: string,
  customerId: string
): Promise<CustomerBookingTrust> {
  const [sub, visitsRes, bookingsRes] = await Promise.all([
    getShopActiveSubscription(shopId, customerId),
    supabase
      .from('visits')
      .select('id')
      .eq('shop_id', shopId)
      .eq('customer_id', customerId),
    supabase
      .from('bookings')
      .select('id, status')
      .eq('shop_id', shopId)
      .eq('customer_id', customerId),
  ]);

  if (visitsRes.error) throw visitsRes.error;
  if (bookingsRes.error) throw bookingsRes.error;

  const hasActiveSubscription =
    sub !== null &&
    sub.status === 'active' &&
    sub.haircuts_used < (sub.plan?.haircut_count ?? 0);

  const bookings = bookingsRes.data ?? [];
  const completedBookings = bookings.filter((b) => b.status === 'completed').length;
  const noShowCount = bookings.filter((b) => b.status === 'no_show').length;
  const lateCancelledCount = bookings.filter((b) => b.status === 'cancelled').length;
  const completedVisits = (visitsRes.data ?? []).length;

  if (noShowCount >= 3 && !hasActiveSubscription) {
    return {
      hasActiveSubscription,
      completedBookings,
      completedVisits,
      noShowCount,
      lateCancelledCount,
      isTrusted: false,
      trustBadge: 'مقيّد بسبب عدم الحضور المتكرر',
      canBook: false,
      blockReason: 'تم إيقاف الحجز المسبق مؤقتًا بسبب تغيّبك عن 3 مواعيد سابقة. تواصل مع المحل لإعادة التفعيل.',
    };
  }

  if (hasActiveSubscription) {
    return {
      hasActiveSubscription: true,
      completedBookings,
      completedVisits,
      noShowCount,
      lateCancelledCount,
      isTrusted: true,
      trustBadge: 'مشترك نشط • تأكيد فوري',
      canBook: true,
    };
  }

  if (noShowCount === 0 && (completedBookings >= 1 || completedVisits >= 2)) {
    return {
      hasActiveSubscription: false,
      completedBookings,
      completedVisits,
      noShowCount,
      lateCancelledCount,
      isTrusted: true,
      trustBadge: 'عميل ملتزم • تأكيد فوري',
      canBook: true,
    };
  }

  return {
    hasActiveSubscription: false,
    completedBookings,
    completedVisits,
    noShowCount,
    lateCancelledCount,
    isTrusted: false,
    trustBadge: noShowCount > 0 ? 'يتطلب موافقة المحل (تغيّب سابق)' : 'حجز جديد • بانتظار تأكيد المحل',
    canBook: true,
  };
}

export async function getShopBookingsForDate(
  shopId: string,
  dateStr: string
): Promise<Booking[]> {
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999`);

  const { data, error } = await supabase
    .from('bookings')
    .select('*, customer:customers(*), plan:plans(*)')
    .eq('shop_id', shopId)
    .gte('start_at', dayStart.toISOString())
    .lte('start_at', dayEnd.toISOString())
    .order('start_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Booking[];
}

export async function getAvailableBookingSlots(
  shopId: string,
  dateStr: string,
  options: {
    startHour?: number;
    endHour?: number;
    slotMinutes?: number;
  } = {}
): Promise<BookingSlot[]> {
  const startHour = options.startHour ?? 11;
  const endHour = options.endHour ?? 23;
  const slotMinutes = options.slotMinutes ?? 60;

  const existing = await getShopBookingsForDate(shopId, dateStr);
  const activeBookings = existing.filter(
    (b) => b.status === 'pending' || b.status === 'confirmed'
  );

  const now = Date.now();
  const slots: BookingSlot[] = [];

  for (let hour = startHour; hour < endHour; hour += 1) {
    for (let minute = 0; minute < 60; minute += slotMinutes) {
      const slotStart = new Date(
        `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
      );
      const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60000);

      if (slotEnd.getHours() > endHour && slotEnd.getMinutes() > 0) {
        continue;
      }

      const isPast = slotStart.getTime() <= now + 10 * 60000;

      const isOverlapping = activeBookings.some((b) => {
        const bStart = new Date(b.start_at).getTime();
        const bEnd = new Date(b.end_at).getTime();
        return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
      });

      const startLabel = new Intl.DateTimeFormat('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(slotStart);

      const endLabel = new Intl.DateTimeFormat('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(slotEnd);

      slots.push({
        start_at: slotStart.toISOString(),
        end_at: slotEnd.toISOString(),
        label: `${startLabel} - ${endLabel}`,
        available: !isPast && !isOverlapping,
      });
    }
  }

  return slots;
}

export async function createCustomerBooking(params: {
  shopId: string;
  customer: Customer;
  serviceName: string;
  planId?: string | null;
  startAt: string;
  durationMinutes?: number;
  notes?: string;
}): Promise<Booking> {
  const durationMinutes = params.durationMinutes ?? 60;
  const startDate = new Date(params.startAt);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

  if (Number.isNaN(startDate.getTime()) || startDate.getTime() <= Date.now()) {
    throw new Error('لا يمكن الحجز في وقت سابق للوقت الحالي.');
  }

  const trust = await evaluateCustomerBookingTrust(params.shopId, params.customer.id);
  if (!trust.canBook) {
    throw new Error(trust.blockReason || 'غير مسموح بالحجز حاليًا.');
  }

  const { data: activeExisting, error: activeCheckError } = await supabase
    .from('bookings')
    .select('id, booking_code, start_at')
    .eq('shop_id', params.shopId)
    .eq('customer_id', params.customer.id)
    .in('status', ['pending', 'confirmed'])
    .gte('end_at', new Date().toISOString());

  if (activeCheckError) throw activeCheckError;

  if ((activeExisting ?? []).length > 0) {
    throw new Error(
      `لديك حجز قادم بالفعل برقم ${activeExisting![0].booking_code}. يمكنك إلغاؤه أولًا إذا أردت حجز موعد آخر.`
    );
  }

  const activeSub = await getShopActiveSubscription(params.shopId, params.customer.id);
  const hasUsableSub =
    activeSub !== null &&
    activeSub.status === 'active' &&
    activeSub.haircuts_used < (activeSub.plan?.haircut_count ?? 0);

  const autoConfirmed = trust.isTrusted;
  const status: BookingStatus = autoConfirmed ? 'confirmed' : 'pending';
  const confirmReason = trust.trustBadge;

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      shop_id: params.shopId,
      customer_id: params.customer.id,
      plan_id: params.planId ?? null,
      subscription_id: hasUsableSub ? activeSub!.id : null,
      service_name: params.serviceName.trim() || 'حلاقة',
      duration_minutes: durationMinutes,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      status,
      auto_confirmed: autoConfirmed,
      confirm_reason: confirmReason,
      notes: params.notes?.trim() || null,
    })
    .select('*, customer:customers(*), plan:plans(*)')
    .single();

  if (error) {
    if (error.code === '23P01' || error.message.includes('bookings_no_overlap')) {
      throw new Error('عذرًا، تم حجز هذا الموعد للتو من عميل آخر. اختر ميعادًا آخر متاحًا.');
    }
    throw error;
  }

  const created = data as Booking;

  void triggerBookingPushNotification({
    shop_id: params.shopId,
    booking_id: created.id,
    booking_code: created.booking_code,
    customer_name: params.customer.name,
    customer_phone: params.customer.phone,
    service_name: created.service_name,
    start_at: created.start_at,
    auto_confirmed: created.auto_confirmed,
    status: created.status,
  });

  return created;
}

export async function getCustomerBookings(
  shopId: string,
  customerId: string
): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, plan:plans(*)')
    .eq('shop_id', shopId)
    .eq('customer_id', customerId)
    .order('start_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Booking[];
}

export async function getShopAllBookings(
  shopId: string
): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, customer:customers(*), plan:plans(*), subscription:subscriptions(*, plan:plans(*))')
    .eq('shop_id', shopId)
    .order('start_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Booking[];
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus,
  notes?: string
): Promise<Booking> {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (notes !== undefined) {
    updates.notes = notes;
  }

  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', bookingId)
    .select('*, customer:customers(*), plan:plans(*)')
    .single();

  if (error) throw error;
  return data as Booking;
}

export async function completeBookingAsVisit(
  booking: Booking,
  opts: {
    paymentMethod?: PaymentMethod;
    customCharge?: number;
    forcePaid?: boolean;
  } = {}
): Promise<{ booking: Booking; visit: Visit }> {
  const visitResult = await recordVisit(booking.customer_id, {
    shopId: booking.shop_id,
    haircutType: booking.service_name,
    serviceName: booking.service_name,
    notes: booking.notes
      ? `حجز #${booking.booking_code} — ${booking.notes}`
      : `حجز #${booking.booking_code}`,
    paymentMethod: opts.paymentMethod ?? 'cash',
    customCharge: opts.customCharge,
    forcePaid: opts.forcePaid,
  });

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'completed',
      visit_id: visitResult.visit.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id)
    .select('*, customer:customers(*), plan:plans(*)')
    .single();

  if (error) throw error;

  return {
    booking: data as Booking,
    visit: visitResult.visit,
  };
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