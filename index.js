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
    scoreResult: String, // داده خام دریافتی (مثلاً "امتیاز: 15")
    date: { type: Date, default: Date.now }
});
const UserResult = mongoose.models.UserResult || mongoose.model('UserResult', userResultSchema);

// --- تابع کمکی برای استخراج عدد از رشته امتیاز ---
const extractScore = (str) => {
    if (!str) return 0;
    return parseInt(str.replace(/[^0-9]/g, '')) || 0;
};

// --- بخش API و Health-check (سرور وب) ---
const server = http.createServer(async (req, res) => {
    // حل مشکل CORS برای اینکه مینی‌اپ بتواند اطلاعات را از سرور بگیرد
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // آدرس جدید برای دریافت لیست برترین‌ها در مینی‌اپ
    if (req.url === '/api/leaderboard') {
        try {
            if (!dbConnected) throw new Error("Database not connected");
            
            const allResults = await UserResult.find();
            const sorted = allResults
                .map(u => ({
                    name: u.firstName || 'کاربر',
                    score: extractScore(u.scoreResult)
                }))
                .sort((a, b) => b.score - a.score) // رتبه‌بندی واقعی از بیشترین به کمترین
                .slice(0, 10);

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(sorted));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
        return;
    }

    // پاسخ برای UptimeRobot و Koyeb Health Check
    console.log("🔔 Ping received at: " + new Date().toLocaleString('fa-IR'));
    res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
    res.write('Bot & API are Online! ✅');
    res.end();
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🌐 Web Server (API + Health-check) running on port ${PORT}`);
});

// --- دستورات ربات تلگرام ---

bot.start((ctx) => {
    ctx.reply(`سلام ${ctx.from.first_name}! 🎬\nآماده‌ای اطلاعات سینمایی‌ت رو به چالش بکشی؟\n\nروی دکمه زیر بزن و از منوی بازی انتخاب کن:`, {
        reply_markup: {
            keyboard: [
                [{ text: "🎮 ورود به دنیای مسابقه", web_app: { url: WEB_APP_URL } }],
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
        const newScore = extractScore(resultText); // استخراج عدد امتیاز
        const userId = ctx.from.id;

        if (dbConnected) {
            // جستجوی امتیاز قبلی کاربر در دیتابیس
            const existingRecord = await UserResult.findOne({ userId: userId });

            if (existingRecord) {
                const oldScore = extractScore(existingRecord.scoreResult);
                
                if (newScore > oldScore) {
                    // اگر امتیاز جدید بهتر بود، بروزرسانی کن
                    existingRecord.scoreResult = resultText;
                    existingRecord.firstName = ctx.from.first_name;
                    existingRecord.date = Date.now();
                    await existingRecord.save();
                    await ctx.reply(`🎊 تبریک! رکورد جدیدی ثبت کردی:\n✅ ${resultText}`);
                } else {
                    // اگر امتیاز جدید کمتر یا مساوی بود
                    await ctx.reply(`خسته نباشی ${ctx.from.first_name}! امتیازت: ${newScore}\nرکورد قبلی تو (${oldScore}) همچنان بهتر است. 💪`);
                }
            } else {
                // اگر اولین بار است که بازی می‌کند، رکورد جدید بساز
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

// جدول رده‌بندی شیک برای داخل تلگرام (نسخه بک‌آپ)
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

// آمار مدیریت
bot.command('stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    try {
        const total = await UserResult.countDocuments();
        const users = await UserResult.distinct('userId');
        ctx.reply(`📊 آمار:\n👥 کاربران: ${users.length}\n🎮 کل بازی‌ها: ${total}`);
    } catch (e) { console.error(e); }
});

// --- اجرای ربات ---
bot.telegram.deleteWebhook().then(() => {
    bot.launch().then(() => console.log("🚀 Telegram Bot Launch Successful!"));
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

