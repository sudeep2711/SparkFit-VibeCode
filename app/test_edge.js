const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pojshuemshcdllrqkhog.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanNodWVtc2hjZGxscnFraG9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MjU5MDAsImV4cCI6MjA4ODUwMTkwMH0.4mZa4BK0ff2LbpTovuDZy2stW4GwNmrdpAbdii6Ghcs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log('Not logging in. Using anon key.');

  console.log('Calling chat-onboarding...');
  const { data: funcData, error: funcError } = await supabase.functions.invoke('chat-onboarding', {
    body: { history: [], userMessage: 'hello' }
  });

  if (funcError) {
    console.error('Function error:', funcError.message);
  } else {
    // If it's a stream, it might not log perfectly but we will see
    console.log('Function success:', funcData ? 'Got data back' : 'No data');
  }
}

test();
