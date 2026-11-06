const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const puppeteer = require('puppeteer');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const DATA_FILE = './user_ids.json';

function loadUserIds() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({}));
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
}

function saveUserIds(users) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

async function redeemGiftcode(code, playerId) {
    const browserInstance = await puppeteer.launch({ 
        headless: true, 
        defaultViewport: null 
    });
    try {
        const page = await browserInstance.newPage();
        await page.goto('https://giftcode.vnggames.com/vn/redeem/ptg', { waitUntil: 'networkidle2', timeout: 30000 });

        await page.waitForSelector('input', { timeout: 25000 });
        
        // Điền dữ liệu vào đúng các ô input trên trang web
        await page.evaluate((id, giftcode) => {
            const inputs = Array.from(document.querySelectorAll('input'));
            
            // Ô nhập mã Giftcode ("Nhập thông tin code")
            const codeInput = inputs.find(i => i.placeholder && i.placeholder.includes('Nhập thông tin code'));
            if (codeInput) {
                codeInput.value = giftcode;
                codeInput.dispatchEvent(new Event('input', { bubbles: true }));
                codeInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Ô nhập ID nhân vật ("Chọn nhân vật / Nhập ID nhân vật")
            const idInput = inputs.find(i => i.placeholder && i.placeholder.includes('Nhập ID nhân vật'));
            if (idInput) {
                idInput.value = id;
                idInput.dispatchEvent(new Event('input', { bubbles: true }));
                idInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, playerId, code);

        // Click nút nhập code
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const targetBtn = buttons.find(b => b.innerText.includes('Nhập code') || b.innerText.includes('Xác nhận') || b.innerText.includes('Đổi'));
            if (targetBtn) {
                targetBtn.click();
            } else {
                const submitBtn = document.querySelector('button[type="submit"]') || buttons[buttons.length - 1];
                if (submitBtn) submitBtn.click();
            }
        });

        // Chờ thông báo popup phản hồi từ web (tối đa 7 giây)
        let statusResult = "THÀNH CÔNG";

        try {
            await page.waitForFunction(() => {
                const bodyText = document.body.innerText;
                return bodyText.includes('thành công') || bodyText.includes('đã nhập') || bodyText.includes('thất bại') || bodyText.includes('hết hạn') || bodyText.includes('giới hạn') || bodyText.includes('không tồn tại') || bodyText.includes('sai');
            }, { timeout: 7000 });

            const pageInfo = await page.evaluate(() => {
                const popup = document.querySelector('.swal2-html-container, .el-message, [class*="popup"], [class*="modal"], [class*="toast"]');
                return popup ? popup.innerText.trim() : document.body.innerText;
            });

            const lowerText = pageInfo.toLowerCase();
            if (lowerText.includes('đã nhập') || lowerText.includes('vượt quá') || lowerText.includes('thất bại') || lowerText.includes('không tồn tại') || lowerText.includes('hết hạn') || lowerText.includes('sai') || lowerText.includes('giới hạn')) {
                statusResult = "THẤT BẠI";
            } else if (lowerText.includes('thành công')) {
                statusResult = "THÀNH CÔNG";
            }
        } catch (e) {
            statusResult = "THÀNH CÔNG";
        }

        await browserInstance.close();
        return statusResult;

    } catch (error) {
        console.error(error);
        await browserInstance.close();
        return "THẤT BẠI";
    }
}

client.on('ready', () => {
    console.log(`Bot đã sẵn sàng với tài khoản: ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const content = message.content.trim();

    // Khi người dùng chỉ chat đúng dấu "!" để xem hướng dẫn lệnh
    if (content === '!') {
        let helpMsg = '🤖 **HƯỚNG DẪN SỬ DỤNG BOT GIFTCODE PLAY TOGETHER**:\n\n';
        helpMsg += '🔹 `!addid <ID_Game>` : Thêm ID game vào danh sách lưu trữ.\n';
        helpMsg += '🔹 `!listid` : Xem danh sách tất cả các ID đã lưu.\n';
        helpMsg += '🔹 `!delid <ID_Game>` : Xóa một ID ra khỏi danh sách.\n';
        helpMsg += '🔹 `!nhapcode <Mã_Code>` : Tự động nhập giftcode cho toàn bộ danh sách ID.\n';
        return message.reply(helpMsg);
    }

    // 1. Lệnh thêm ID: !addid <playerId>
    if (content.startsWith('!addid')) {
        const args = content.split(' ');
        const playerId = args[1];

        if (!playerId) {
            return message.reply('⚠️ Vui lòng nhập ID! Ví dụ: `!addid GLCC-TTZL-LMGC`');
        }

        try {
            const users = loadUserIds();
            users[playerId] = `Tài khoản (${playerId})`;
            saveUserIds(users);

            return message.reply(`✅ Đã thêm thành công ID **${playerId}** vào danh sách! Tổng số ID hiện tại: **${Object.keys(users).length}**`);
        } catch (error) {
            console.error(error);
            return message.reply(`❌ Lỗi khi lưu ID **${playerId}**.`);
        }
    }

    // 2. Lệnh xem danh sách ID: !listid
    if (content === '!listid') {
        const users = loadUserIds();
        const entries = Object.entries(users);

        if (entries.length === 0) {
            return message.reply('📭 Danh sách ID đang trống!');
        }

        let listMsg = '📋 **Danh sách ID Play Together:**\n';
        for (const [id, name] of entries) {
            listMsg += `- ID: \`${id}\` | Tên: **${name}**\n`;
        }
        return message.reply(listMsg);
    }

    // 3. Lệnh xóa ID: !delid <id>
    if (content.startsWith('!delid')) {
        const args = content.split(' ');
        const playerId = args[1];

        if (!playerId) {
            return message.reply('⚠️ Vui lòng nhập ID cần xóa!');
        }

        const users = loadUserIds();
        if (!users[playerId]) {
            return message.reply(`❌ Không tìm thấy ID **${playerId}** trong danh sách!`);
        }

        delete users[playerId];
        saveUserIds(users);
        return message.reply(`🗑️ Đã xóa thành công ID **${playerId}** khỏi danh sách!`);
    }

    // 4. Lệnh nhập code cho tất cả và tổng hợp kết quả: !nhapcode <mã>
    if (content.startsWith('!nhapcode')) {
        const args = content.split(' ');
        const code = args[1];

        if (!code) {
            return message.reply('⚠️ Vui lòng nhập mã giftcode! Ví dụ: `!nhapcode PTSUPERPETS`');
        }

        const users = loadUserIds();
        const playerIds = Object.keys(users);

        if (playerIds.length === 0) {
            return message.reply('⚠️ Danh sách ID đang trống! Hãy dùng lệnh `!addid` trước.');
        }

        const statusMsg = await message.channel.send(`⏳ Đang tiến hành tự động nhập giftcode **${code}** cho **${playerIds.length}** tài khoản, vui lòng đợi trong giây lát...`);

        let successCount = 0;
        let failCount = 0;
        let reportLines = [];

        let index = 1;
        for (const playerId of playerIds) {
            const statusResult = await redeemGiftcode(code, playerId);

            if (statusResult === "THÀNH CÔNG") {
                successCount++;
                reportLines.push(`${index}. \`${playerId}\` - TRẠNG THÁI: ✅ **THÀNH CÔNG**`);
            } else {
                failCount++;
                reportLines.push(`${index}. \`${playerId}\` - TRẠNG THÁI: ❌ **THẤT BẠI**`);
            }
            index++;
        }

        let finalReport = `code **${code}**\n`;
        finalReport += `_______________________________________\n`;
        finalReport += reportLines.join('\n');
        finalReport += `\n_______________________________________\n`;
        finalReport += `THÀNH CÔNG: **${successCount}**\n`;
        finalReport += `THẤT BẠI: **${failCount}**`;

        await statusMsg.edit(finalReport);
    }
});

client.login(process.env.DISCORD_TOKEN);