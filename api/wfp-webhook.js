// api/wfp-webhook.js
export default async function handler(req, res) {
    // Тільки POST-запити від WayForPay
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const wfpData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        // Перевіряємо статус платежу
        if (wfpData.transactionStatus !== 'Approved') {
            return res.status(200).json({ status: 'Ignored', reason: 'Not Approved' });
        }

        const customerEmail = wfpData.email;
        const customerPhone = wfpData.phone;

        if (!customerEmail && !customerPhone) {
            return res.status(200).json({ status: 'Ignored', reason: 'No email or phone' });
        }

        // ── Ваш ключ Pipedrive (потрібно додати в Vercel Environment Variables як PIPEDRIVE_API_TOKEN) ──
        const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;
        // ── ID етапу "Оплачено" в вашій воронці Pipedrive (замініть на реальний ID) ──
        const PIPEDRIVE_SUCCESS_STAGE_ID = 12; // приклад: 12

        if (!PIPEDRIVE_API_TOKEN) {
            console.error('Missing PIPEDRIVE_API_TOKEN in environments');
            return res.status(500).json({ error: 'Server misconfiguration' });
        }

        // 1. Шукаємо людину (Person) в Pipedrive за email або телефоном
        const searchTerm = customerEmail || customerPhone;
        const searchUrl = `https://api.pipedrive.com/v1/persons/search?term=${encodeURIComponent(searchTerm)}&api_token=${PIPEDRIVE_API_TOKEN}`;

        const searchResult = await fetch(searchUrl).then(r => r.json());

        if (!searchResult.success || !searchResult.data.items || searchResult.data.items.length === 0) {
            console.log('Person not found in Pipedrive for term:', searchTerm);
            return res.status(200).json({ status: 'Ignored', reason: 'Person not found' });
        }

        const personId = searchResult.data.items[0].item.id;

        // 2. Шукаємо відкриту угоду (Deal) прив'язану до цієї людини
        const dealsUrl = `https://api.pipedrive.com/v1/persons/${personId}/deals?status=open&api_token=${PIPEDRIVE_API_TOKEN}`;
        const dealsResult = await fetch(dealsUrl).then(r => r.json());

        if (!dealsResult.success || !dealsResult.data || dealsResult.data.length === 0) {
            console.log('No open deals found for person ID:', personId);
            return res.status(200).json({ status: 'Ignored', reason: 'No open deals found' });
        }

        // Беремо першу відкриту угоду
        const dealId = dealsResult.data[0].id;

        // 3. Оновлюємо статус угоди (переміщуємо в етап "Оплачено")
        const updateDealUrl = `https://api.pipedrive.com/v1/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`;
        const updatePayload = {
            stage_id: PIPEDRIVE_SUCCESS_STAGE_ID,
            status: 'won', // або 'open', якщо угода ще не закривається
            value: wfpData.amount // опціонально: оновлюємо суму угоди
        };

        const updateResponse = await fetch(updateDealUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
        }).then(r => r.json());

        if (!updateResponse.success) {
            console.error('Failed to update deal in Pipedrive', updateResponse);
        } else {
            console.log(`Successfully updated Deal #${dealId} to stage ${PIPEDRIVE_SUCCESS_STAGE_ID}`);
        }

        // Відповідь для WayForPay (обов'язкова структура)
        const time = Math.floor(Date.now() / 1000);
        return res.status(200).json({
            orderReference: wfpData.orderReference,
            status: "accept",
            time: time
        });

    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
