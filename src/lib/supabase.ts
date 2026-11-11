   import { createClient } from '@supabase/supabase-js';

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    /**
     * Subscription plan belonging to a shop.
     * New plans should always have the current shop_id.
     */
    export type Plan = {
      id: string;
      name: string;
      description: string | null;
      haircut_count: number;
      price: number;
      duration_days: number;
      is_active: boolean;
      shop_id?: string | null;
      created_at: string;
    };

    export type Customer = {
      id: string;
      name: string;
      phone: string | null;
      notes: string | null;
      is_blocked: boolean;
      shop_id: string | null;
      created_at: string;
      whatsapp_transactional_opt_in?: boolean;
      whatsapp_opt_in_at?: string | null;
      whatsapp_opt_in_source?: string | null;
      whatsapp_opt_out_at?: string | null;
    };

    export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';

    export type Subscription = {
      id: string;
      customer_id: string;
      plan_id: string;
      start_date: string;
      end_date: string;
      haircuts_used: number;
      status: SubscriptionStatus;
      shop_id?: string | null;
      created_at: string;
      plan?: Plan;
    };

    export type PaymentType = 'subscription' | 'paid';

    export type Visit = {
      id: string;
      customer_id: string;
      subscription_id: string | null;
      payment_type: PaymentType;
      haircut_type: string | null;
      charge_amount: number;
      visit_date: string;
      notes: string | null;
      shop_id?: string | null;
      created_at: string;
    };

    export type CustomerWithStats = Customer & {
      visits_count: number;
      active_subscription: Subscription | null;
      total_paid: number;
    };

    export const REGULAR_HAIRCUT_PRICE = 50;

    export const COMPANY_FEE_PER_VISIT = 10;
    export const COMPANY_NAME = 'رؤية';
    export const SYSTEM_NAME = 'BarberOS';

    export type ShopStatus = 'pending' | 'approved' | 'rejected' | 'blocked';

    export type Shop = {
      id: string;
      shop_name: string;
      owner_name: string;
      owner_phone: string;
      owner_email: string;
      national_id: string;
      shop_type: string;
      has_branches: boolean;
      branch_count: number;
      shop_address: string | null;
      personal_address: string | null;
      year_started: number | null;
      approved_at: string | null;
      status: ShopStatus;
      logo_url?: string | null;
      regular_haircut_price?: number;
      created_at: string;
      updated_at: string;
    };

    export type ShopAdmin = {
      id: string;
      shop_id: string;
      full_name: string;
      phone: string;
      email: string;
      national_id: string | null;
      created_at: string;
    };
