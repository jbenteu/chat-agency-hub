import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ocfojfyiyzhnriorovqh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Y2ifcrOA_jJdZkYjVzVw8g_4kBZWbQb";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
