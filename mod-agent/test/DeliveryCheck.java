package edu.petra.igso.mods;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class DeliveryCheck {
    public static void main(String[] args) throws Exception {
        String id = "11111111-2222-4333-8444-555555555555";
        String key = "a".repeat(64);
        HttpServer collector = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch queued = new CountDownLatch(1);
        CountDownLatch received = new CountDownLatch(122);
        List<String> bodies = new CopyOnWriteArrayList<>();
        List<String> headers = new CopyOnWriteArrayList<>();
        collector.createContext("/telemetry", exchange -> {
            try {
                bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                headers.add(exchange.getRequestHeaders().getFirst("Authorization"));
                int request = bodies.size();
                if (request == 1) {
                    started.countDown();
                    if (!queued.await(5, TimeUnit.SECONDS)) throw new AssertionError("Producer timed out");
                }
                exchange.sendResponseHeaders(request == 1 ? 503 : 201, -1);
                received.countDown();
            } catch (InterruptedException stopped) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        collector.start();
        Path file = Files.createTempFile("igso-test-", ".properties");
        try {
            Files.writeString(file, "endpoint=http://127.0.0.1:" + collector.getAddress().getPort() +
                    "/telemetry\nserver-id=" + id + "\nagent-key=" + key + "\ninterval-seconds=2\n");
            try (Delivery delivery = new Delivery(file)) {
                String original = "{\"sampleId\":\"" + id + "\",\"timestamp\":\"2026-01-01T00:00:00Z\"}";
                delivery.add(original);
                if (!started.await(8, TimeUnit.SECONDS)) throw new AssertionError("No sample reached the collector");
                for (int i = 1; i <= 125; i++) delivery.add(Integer.toString(i));
                queued.countDown();
                if (!received.await(22, TimeUnit.SECONDS)) throw new AssertionError("Backlog did not drain");
                if (!bodies.get(0).equals(original) || !bodies.get(1).equals(original))
                    throw new AssertionError("Retry changed the sample");
                for (int i = 2; i < bodies.size(); i++) {
                    if (!bodies.get(i).equals(Integer.toString(i + 4)))
                        throw new AssertionError("Unexpected sample order after overflow");
                }
                if (headers.stream().anyMatch(header -> !("Bearer " + key).equals(header)))
                    throw new AssertionError("Missing server credentials");
            }
            System.out.println("Retry preserved ID and timestamp; the newest 120 queued samples arrived in order.");
        } finally {
            queued.countDown();
            collector.stop(0);
            Files.deleteIfExists(file);
        }
    }
}
