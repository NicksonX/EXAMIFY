import { supabase } from "@/lib/supabase";

/** Server-authorized application role check. This is not Wallet functionality. */
export async function isFinanceAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_finance_admin");
  return !error && data === true;
}
