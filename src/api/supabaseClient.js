import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hvanbipjvniyilhqajvv.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2YW5iaXBqdm5peWlsaHFhanZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNzAzMjksImV4cCI6MjA4NDg0NjMyOX0.qPlYf9CksAQ2ZzPwDZ26lotnJQ756sULLbiNGtkCzX8'

export const supabase = createClient(supabaseUrl, supabaseKey)
