## 1. Backend Fix

- [x] 1.1 In `api/controllers/ordersController.js`, inside the `updateItemStatus` function, after the calls to `checkAndUpdateOrderStatus()` (line ~1659) and `checkAndUpdateOrderStatusConfirmed()` (line ~1664), add a single `SELECT status FROM orders WHERE id = ?` query and update `order.status` with the fresh value before the response is built (line ~1667).

## 2. Verification

- [x] 2.1 Manually verify: as a seller, mark the last pending item in an order as "sent" and confirm the response JSON contains `order.status: "sent"` (not "paid").
