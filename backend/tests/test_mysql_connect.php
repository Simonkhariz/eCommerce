<?php

declare(strict_types=1);

$host = '127.0.0.1';
$port = 3306;
$user = 'root';
$pass = '';

$mysqli = @new mysqli($host, $user, $pass, '', $port);
if ($mysqli->connect_errno) {
    echo "STATUS: NOT_CONNECTED (" . $mysqli->connect_error . ")\n";
    exit(1);
}

echo "STATUS: CONNECTED (Server: " . $mysqli->server_info . ")\n";

// Check if shopco_dev exists
$result = $mysqli->query("SHOW DATABASES LIKE 'shopco_dev'");
if ($result && $result->num_rows > 0) {
    echo "DATABASE: shopco_dev EXISTS\n";
} else {
    echo "DATABASE: shopco_dev NOT_FOUND\n";
}

$mysqli->close();
exit(0);
