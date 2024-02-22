const crypto = require('node:crypto');

function generateRandomHex() {
    const buffer = Buffer.allocUnsafe(6); // 6 bytes for a 48-bit integer
    crypto.randomFillSync(buffer);

    const randomHex = buffer.toString('hex').toUpperCase().slice(0, 12);
    return randomHex;
};


module.exports.generateRandomHex = generateRandomHex;