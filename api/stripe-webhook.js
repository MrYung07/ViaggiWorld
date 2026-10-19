const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
  const signature = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).send('Webhook not configured');
  let rawBody;
  try {
    rawBody = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      if (session.payment_status === 'paid') {
        await admin.from('orders').update({ payment_status: 'paid', paid_at: new Date().toISOString() }).eq('stripe_session_id', session.id);
      }
    }
    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object;
      await admin.from('orders').update({ payment_status: 'failed' }).eq('stripe_session_id', session.id);
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err.message);
    return res.status(400).send('Webhook signature verification failed');
  }
};
