const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito.' });
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!stripeKey || !supabaseUrl || !anonKey) return res.status(500).json({ error: 'Configura le variabili ambiente di Supabase e Stripe su Vercel.' });
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Accedi prima di procedere al pagamento.' });
    const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return res.status(401).json({ error: 'Sessione non valida. Accedi di nuovo.' });
    const offerId = req.body && req.body.offerId;
    if (!offerId || typeof offerId !== 'string') return res.status(400).json({ error: 'Offerta non valida.' });
    const { data: offer, error } = await supabase.from('offers').select('id,title,description,price,currency,active').eq('id', offerId).eq('active', true).maybeSingle();
    if (error || !offer) return res.status(404).json({ error: 'Offerta non trovata o non disponibile.' });
    const stripe = new Stripe(stripeKey);
    const origin = (req.headers.origin && new URL(req.headers.origin).host === req.headers.host) ? req.headers.origin : 'https://' + req.headers.host;
    const amount = Math.round(Number(offer.price) * 100);
    if (!Number.isSafeInteger(amount) || amount < 100) return res.status(400).json({ error: 'Prezzo dell’offerta non valido.' });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: userData.user.email,
      client_reference_id: userData.user.id,
      metadata: { offer_id: offer.id, user_id: userData.user.id },
      line_items: [{ price_data: { currency: offer.currency || 'eur', unit_amount: amount, product_data: { name: offer.title, description: (offer.description || '').slice(0, 500) } }, quantity: 1 }],
      success_url: origin + '/?payment=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: origin + '/?payment=cancelled'
    });
    const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Manca SUPABASE_SERVICE_ROLE_KEY su Vercel.' });
    const { error: orderError } = await admin.from('orders').insert({ user_id: userData.user.id, offer_id: offer.id, amount_total: amount, currency: offer.currency || 'eur', stripe_session_id: session.id, payment_status: 'pending' });
    if (orderError) { await stripe.checkout.sessions.expire(session.id); throw orderError; }
    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error.message);
    return res.status(500).json({ error: 'Non è stato possibile creare il pagamento. Riprova più tardi.' });
  }
};
