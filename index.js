require('dotenv').config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const http = require('http');

// --- تنظیمات اصلی ---
const BOT_TOKEN = process.env.BOT_TOKEN; 
const MONGO_URI = process.env.MONGO_URI;
const WEB_APP_URL = 'https://gharib206.github.io/cinemaqquizbot/';
const ADMIN_ID = 78316479; // آیدی مدیریت شما

if (!BOT_TOKEN) {
    console.error("❌ خطا: BOT_TOKEN یافت نشد!");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// --- مدیریت اتصال دیتابیس ---
let dbConnected = false;
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ اتصال موفق به MongoDB برقرار شد.');
        dbConnected = true;
    })
    .catch(err => console.error('❌ خطا در اتصال به دیتابیس:', err));

// تعریف مدل دیتابیس
const userResultSchema = new mongoose.Schema({
    userId: Number,
    firstName: String,
    scoreResult: String,
    date: { type: Date, default: Date.now }
});
const UserResult = mongoose.models.UserResult || mongoose.model('UserResult', userResultSchema);

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

// ۳. نمایش جدول رده‌بندی (نسخه شیک‌تر)
bot.hears("🏆 مشاهده جدول رده‌بندی", async (ctx) => {
    try {
        const topScores = await UserResult.find().sort({ date: -1 }).limit(10);
        if (topScores.length === 0) {
            return ctx.reply("هنوز هیچ امتیازی ثبت نشده! 🏆");
        }
        
        let message = "🏆 **لیست آخرین نتایج ثبت شده:**\n\n";
        topScores.forEach((user, index) => {
            let icon = "🔹";
            if (index === 0) icon = "🥇";
            if (index === 1) icon = "🥈";
            if (index === 2) icon = "🥉";
            
            message += `${icon} ${user.firstName || 'کاربر'} ➔ ${user.scoreResult}\n`;
        });
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
        ctx.reply("❌ خطا در خواندن اطلاعات.");
    }
});

// ۴. دستور آمار (فقط برای شما)
bot.command('stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return; // سکوت در برابر کاربران دیگر

    try {
        const totalGames = await UserResult.countDocuments();
        const uniqueUsers = await UserResult.distinct('userId');

        let statMsg = `📊 **گزارش مدیریت ربات:**\n\n`;
        statMsg += `👥 کل کاربران: ${uniqueUsers.length} نفر\n`;
        statMsg += `🎮 کل بازی‌های انجام شده: ${totalGames} بار\n`;
        
        await ctx.reply(statMsg, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply("خطا در استخراج آمار.");
    }
});

// --- مدیریت زنده ماندن و راه‌اندازی ---

http.createServer((req, res) => {
    console.log("🔔 ضربان قلب دریافت شد در: " + new Date().toLocaleString('fa-IR'));
    res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
    res.write('ربات آنلاین است ✅');
    res.end();
}).listen(process.env.PORT || 8080);

bot.telegram.deleteWebhook().then(() => {
    bot.launch().then(() => console.log("🚀 ربات با موفقیت آنلاین شد."));
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
