const crypto = require('node:crypto');

function generateRandomHex(size = 12) {
    const buffer = Buffer.allocUnsafe(6); // 6 bytes for a 48-bit integer
    crypto.randomFillSync(buffer);

    const randomHex = buffer.toString('hex').toUpperCase().slice(0, size);
    return randomHex;
};


module.exports.generateRandomHex = generateRandomHex;