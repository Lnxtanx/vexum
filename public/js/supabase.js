// public/js/supabase.js

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://zxgvwigxkwkdmxgqzqaw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4Z3Z3aWd4a3drZG14Z3F6cWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg2ODY5OTIsImV4cCI6MjA1NDI2Mjk5Mn0.qx-emzQL1Cw7PRkRWVQBMLrEba1ZTymnXLW2UbSybBw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
