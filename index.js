require('dotenv').config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const http = require('http');

// --- تنظیمات اصلی ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const WEB_APP_URL = 'https://gharib206.github.io/cinemaqquizbot/';
const ADMIN_ID = 78316479;

if (!BOT_TOKEN || !MONGO_URI) {
    console.error("❌ خطا: متغیرهای محیطی (Token یا Mongo) تنظیم نشده‌اند!");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// --- اتصال به دیتابیس ---
let dbConnected = false;
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB Connected');
        dbConnected = true;
    })
    .catch(err => console.error('❌ MongoDB Error:', err.message));

// تعریف مدل دیتابیس
const userResultSchema = new mongoose.Schema({
    userId: Number,
    firstName: String,
    scoreResult: String, // داده خام مثل "امتیاز: 15"
    date: { type: Date, default: Date.now }
});
const UserResult = mongoose.models.UserResult || mongoose.model('UserResult', userResultSchema);

// --- تابع کمکی برای استخراج عدد از رشته امتیاز (بهینه شده) ---
const extractScore = (str) => {
    if (!str) return 0;
    const match = str.match(/\d+/); // پیدا کردن اولین عدد در رشته
    return match ? parseInt(match[0]) : 0;
};

// --- بخش API و Health-check (سرور وب) ---
const server = http.createServer(async (req, res) => {
    // حل مشکل CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // مسیر API برای دریافت لیست برترین‌ها در مینی‌اپ
    if (req.url.startsWith('/api/leaderboard')) {
        try {
            if (!dbConnected) throw new Error("Database not connected");
            
            const allResults = await UserResult.find();
            const sorted = allResults
                .map(u => ({
                    name: u.firstName || 'کاربر ناشناس',
                    score: extractScore(u.scoreResult)
                }))
                .sort((a, b) => b.score - a.score) // مرتب‌سازی نزولی
                .slice(0, 10); // ۱۰ نفر اول

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(sorted));
        } catch (e) {
            console.error("API Error:", e.message);
            res.writeHead(500);
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
        return;
    }

    // پاسخ برای UptimeRobot و Koyeb Health Check
    res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
    res.write('Bot & API are Online! ✅');
    res.end();
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🌐 Web Server running on port ${PORT}`);
});

// --- دستورات ربات تلگرام ---

bot.start((ctx) => {
    const name = ctx.from.first_name || "دوست من";
    const welcomeMessage = 
        `سلام ${name}! به چالش بزرگ سینما خوش آمدی 🎬\n\n` +
        `🏆 در این مسابقه اطلاعات سینمایی‌ت رو بسنج و رکورد بزن!\n\n` +
        `⚠️ **نکته بسیار مهم برای لود شدن بازی:**\n` +
        `اگر از **پروکسی داخلی** تلگرام استفاده می‌کنید، احتمالاً بازی باز نخواهد شد. برای تجربه بدون مشکل، لطفاً ابتدا **فیلترشکن (VPN)** خود را روشن کنید و سپس روی دکمه زیر بزنید.`;

    ctx.reply(welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
            keyboard: [
                [{ text: "🎮 شروع مسابقه سینمایی", web_app: { url: WEB_APP_URL } }],
                [{ text: "🏆 مشاهده رتبه‌بندی (در تلگرام)" }]
            ],
            resize_keyboard: true
        }
    });
});

// دریافت داده از مینی‌اپ و مدیریت بالاترین امتیاز (High Score)
bot.on('web_app_data', async (ctx) => {
    try {
        const resultText = ctx.message.web_app_data.data;
        const newScore = extractScore(resultText);
        const userId = ctx.from.id;

        if (dbConnected) {
            const existingRecord = await UserResult.findOne({ userId: userId });

            if (existingRecord) {
                const oldScore = extractScore(existingRecord.scoreResult);
                
                if (newScore > oldScore) {
                    existingRecord.scoreResult = resultText;
                    existingRecord.firstName = ctx.from.first_name;
                    existingRecord.date = Date.now();
                    await existingRecord.save();
                    await ctx.reply(`🎊 تبریک ${ctx.from.first_name}! رکورد جدیدی ثبت کردی:\n✅ ${resultText}`);
                } else {
                    await ctx.reply(`خسته نباشی! امتیاز این دور تو: ${newScore}\nرکورد قبلی تو (${oldScore}) همچنان بهتر است. 💪`);
                }
            } else {
                const newRecord = new UserResult({
                    userId: userId,
                    firstName: ctx.from.first_name,
                    scoreResult: resultText
                });
                await newRecord.save();
                await ctx.reply(`✅ اولین امتیاز تو ثبت شد: ${resultText}`);
            }
        }
    } catch (e) {
        console.error("Save Error:", e);
        ctx.reply("❌ خطا در ثبت امتیاز.");
    }
});

bot.hears("🏆 مشاهده رتبه‌بندی (در تلگرام)", async (ctx) => {
    try {
        const all = await UserResult.find();
        const top = all
            .map(u => ({ name: u.firstName, score: extractScore(u.scoreResult) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        if (top.length === 0) return ctx.reply("هنوز امتیازی ثبت نشده.");

        let msg = "🏆 **۱۰ نفر برتر مسابقه:**\n\n";
        top.forEach((u, i) => {
            let m = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🔹";
            msg += `${m} ${u.name} ➔ ${u.score} امتیاز\n`;
        });
        ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply("خطا در محاسبه رتبه‌بندی.");
    }
});

bot.command('stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    try {
        const total = await UserResult.countDocuments();
        const users = await UserResult.distinct('userId');
        ctx.reply(`📊 آمار مدیریت:\n👥 تعداد کل بازیکنان: ${users.length}\n🎮 کل دفعات بازی: ${total}`);
    } catch (e) { console.error(e); }
});

// --- اجرای ربات ---
bot.telegram.deleteWebhook().then(() => {
    bot.launch().then(() => console.log("🚀 Telegram Bot Launch Successful!"));
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

