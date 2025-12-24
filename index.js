require('dotenv').config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');

// --- تنظیمات اصلی ---
// ۱. توکن ربات خود را اینجا بگذارید
const BOT_TOKEN = process.env.BOT_TOKEN; 

// ۲. لینک مونو دی‌بی (همان که از اطلس گرفتید و پسورد را در آن گذاشتید)
const MONGO_URI = process.env.MONGO_URI;

// ۳. لینک گیتهاب مینی‌اپ خودتان
const WEB_APP_URL = 'https://gharib206.github.io/cinemaqquizbot/';

const bot = new Telegraf(BOT_TOKEN);

// --- تعریف مدل دیتابیس ---
const userResultSchema = new mongoose.Schema({
    userId: Number,
    firstName: String,
    scoreResult: String,
    date: { type: Date, default: Date.now }
});

const UserResult = mongoose.model('UserResult', userResultSchema);

// --- اتصال به دیتابیس ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ اتصال موفق به MongoDB برقرار شد.'))
    .catch(err => console.error('❌ خطا در اتصال به دیتابیس:', err));

// --- دستورات ربات ---

// ۱. شروع و منوی اصلی
bot.start((ctx) => {
    ctx.reply(`سلام ${ctx.from.first_name}! به مسابقه خوش آمدی 🎬`, {
        reply_markup: {
            keyboard: [
                [{ text: "🎬 شروع مسابقه سینمایی", web_app: { url: WEB_APP_URL } }],
                [{ text: "🏆 مشاهده جدول رده‌بندی" }]
            ],
            resize_keyboard: true
        }
    });
});

// ۲. دریافت داده از مینی‌اپ و ذخیره
bot.on('web_app_data', async (ctx) => {
    try {
        // روش قطعی: استخراج داده از بدنه اصلی پیام تلگرام
        // ما مستقیماً به فیلد داده در پیام خام دسترسی پیدا می‌کنیم
        const resultText = ctx.message.web_app_data.data;

        console.log("--- گزارش دقیق ---");
        console.log("داده واقعی استخراج شد:", resultText);

        const newRecord = new UserResult({
            userId: ctx.from.id,
            firstName: ctx.from.first_name,
            scoreResult: resultText // اینجا دیگر قطعا رشته است (مثل: "امتیاز: 10")
        });

        await newRecord.save();
        await ctx.reply(`🏆 ثبت شد: ${resultText}`);

    } catch (error) {
        console.log("خطا:", error.message);
        ctx.reply('خطا در پردازش داده.');
    }
});

// ۳. نمایش جدول رده‌بندی (Leaderboard)
// اصلاح بخش دکمه مشاهده جدول رده‌بندی
bot.hears("🏆 مشاهده جدول رده‌بندی", async (ctx) => {
    try {
        // ۱. دریافت ۵ امتیاز آخر از دیتابیس
        const topScores = await UserResult.find()
            .sort({ date: -1 }) // مرتب‌سازی بر اساس تازه‌ترین‌ها
            .limit(5);

        if (topScores.length === 0) {
            return ctx.reply("هنوز امتیازی در سیستم ثبت نشده است! 🏆");
        }

        // ۲. ساخت پیام متنی
        let message = "🏆 **لیست آخرین امتیازات ثبت شده:**\n\n";
        topScores.forEach((user, index) => {
            message += `${index + 1}. ${user.firstName || 'کاربر'} ➔ ${user.scoreResult}\n`;
        });

        // ۳. ارسال پاسخ به کاربر
        await ctx.reply(message, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error("خطا در نمایش جدول:", error);
        ctx.reply("متأسفانه مشکلی در بارگذاری جدول پیش آمد.");
    }
});

// روشن کردن ربات
bot.launch().then(() => console.log("🚀 ربات آنلاین است!"));

// خروج ایمن
process.once('SIGINT', () => bot.stop('SIGINT'));

process.once('SIGTERM', () => bot.stop('SIGTERM'));

// اضافه کردن برای سازگاری با Koyeb
const http = require('http');
http.createServer((req, res) => {
    res.write('Bot is Online!');
    res.end();
}).listen(process.env.PORT || 8080);

