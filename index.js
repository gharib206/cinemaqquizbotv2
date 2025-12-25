require('dotenv').config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const http = require('http');

// --- تنظیمات اصلی ---
const BOT_TOKEN = process.env.BOT_TOKEN; 
const MONGO_URI = process.env.MONGO_URI;
const WEB_APP_URL = 'https://gharib206.github.io/cinemaqquizbot/';

if (!BOT_TOKEN) {
    console.error("❌ خطا: BOT_TOKEN در متغیرهای محیطی تعریف نشده است!");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// --- تعریف مدل دیتابیس ---
const userResultSchema = new mongoose.Schema({
    userId: Number,
    firstName: String,
    scoreResult: String,
    date: { type: Date, default: Date.now }
});

const UserResult = mongoose.models.UserResult || mongoose.model('UserResult', userResultSchema);

// --- اتصال به دیتابیس با مدیریت خطا ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ اتصال موفق به MongoDB برقرار شد.'))
    .catch(err => console.error('❌ خطا در اتصال به دیتابیس:', err));

// --- دستورات ربات ---

// ۱. شروع و منوی اصلی
bot.start((ctx) => {
    const name = ctx.from.first_name || "دوست من";
    ctx.reply(`سلام ${name}! به چالش بزرگ سینما خوش آمدی 🎬\n\nبرای شروع بازی روی دکمه زیر کلیک کن:`, {
        reply_markup: {
            keyboard: [
                [{ text: "🎬 شروع مسابقه سینمایی", web_app: { url: WEB_APP_URL } }],
                [{ text: "🏆 مشاهده جدول رده‌بندی" }]
            ],
            resize_keyboard: true
        }
    });
});

// ۲. دریافت داده از مینی‌اپ
bot.on('web_app_data', async (ctx) => {
    try {
        const resultText = ctx.message.web_app_data.data;
        
        const newRecord = new UserResult({
            userId: ctx.from.id,
            firstName: ctx.from.first_name,
            scoreResult: resultText
        });

        await newRecord.save();
        await ctx.reply(`✨ عالی بود ${ctx.from.first_name}!\nنتیجه تو با موفقیت ثبت شد:\n✅ ${resultText}`);

    } catch (error) {
        console.error("خطا در ذخیره داده:", error);
        ctx.reply('❌ متأسفانه در ثبت امتیاز مشکلی پیش آمد.');
    }
});

// ۳. نمایش جدول رده‌بندی
bot.hears("🏆 مشاهده جدول رده‌بندی", async (ctx) => {
    try {
        const topScores = await UserResult.find()
            .sort({ date: -1 })
            .limit(10);

        if (topScores.length === 0) {
            return ctx.reply("هنوز هیچ امتیازی ثبت نشده! اولین نفر باش که بازی می‌کنه. 🏆");
        }

        let message = "🏆 **آخرین نتایج ثبت شده:**\n\n";
        topScores.forEach((user, index) => {
            message += `${index + 1}. ${user.firstName || 'کاربر'} ➔ ${user.scoreResult}\n`;
        });

        await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
        ctx.reply("❌ خطا در خواندن اطلاعات از دیتابیس.");
    }
});

// --- راه‌اندازی نهایی ---

// پاک کردن وب‌هوک‌های قدیمی (بسیار مهم برای حل مشکل عدم پاسخگویی)
bot.telegram.deleteWebhook().then(() => {
    console.log("🧹 وب‌هوک‌های قدیمی پاک شدند.");
    bot.launch().then(() => console.log("🚀 ربات با موفقیت آنلاین شد!"));
});

// ایجاد سرور برای پاسخ به Health Check های Koyeb و UptimeRobot
const http = require('http');

http.createServer((req, res) => {
    console.log("Ping received at: " + new Date().toISOString());
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.write('Bot is Online and Healthy!');
    res.end();
}).listen(process.env.PORT || 8080, () => {
    console.log("🌐 Health-check server is running on port 8080");
});

// خروج ایمن
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

