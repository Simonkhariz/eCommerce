<?php
require_once __DIR__ . '/../src/autoload.php';
\App\Config\Env::load(__DIR__ . '/../.env');
$db = \App\Database\Database::getInstance();

$orderNum = 'ORD-20261017-0AC2ED';

echo "=== ORDER ===\n";
$order = $db->fetchOne("SELECT * FROM orders WHERE order_number = ?", 's', [$orderNum]);
print_r($order);

if ($order) {
    echo "\n=== ORDER ITEMS ===\n";
    $items = $db->fetchAll("SELECT * FROM order_items WHERE order_id = ?", 'i', [(int)$order['id']]);
    print_r($items);

    echo "\n=== PAYMENTS ===\n";
    $payments = $db->fetchAll("SELECT * FROM payments WHERE order_id = ?", 'i', [(int)$order['id']]);
    print_r($payments);

    echo "\n=== ORDER STATUS HISTORY ===\n";
    $history = $db->fetchAll("SELECT * FROM order_status_history WHERE order_id = ?", 'i', [(int)$order['id']]);
    print_r($history);
}

echo "\n=== USER 16 ===\n";
$user16 = $db->fetchOne("SELECT id, email, full_name, role FROM users WHERE id = 16");
print_r($user16);

echo "\n=== ALL SESSIONS FOR USER 16 ===\n";
$sessions = $db->fetchAll("SELECT * FROM sessions WHERE user_id = 16 ORDER BY id DESC LIMIT 5");
print_r($sessions);

echo "\n=== MONNIFY DIRECT VERIFICATION ===\n";
try {
    $monnify = new \App\Services\MonnifyService($db);
    $verifyResult = $monnify->verifyTransaction('MNFY-ORD-20261017-0AC2ED-98535bbc');
    print_r($verifyResult);
} catch (\Throwable $e) {
    echo "Monnify error: " . $e->getMessage() . "\n";
}
