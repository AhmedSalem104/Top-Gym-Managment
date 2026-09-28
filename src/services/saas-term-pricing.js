'use strict';

function roundMoney(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}

function priceSaasTerm(term) {
    const price = roundMoney(term?.price);
    const discountAmount = roundMoney(term?.discountAmount);
    return {
        price,
        discountAmount,
        amountDue: roundMoney(Math.max(0, price - discountAmount)),
        currency: String(term?.currency || 'EGP').toUpperCase()
    };
}

module.exports = { roundMoney, priceSaasTerm };
