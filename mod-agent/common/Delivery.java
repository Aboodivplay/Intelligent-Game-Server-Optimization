package edu.petra.igso.mods;

import java.io.IOException;
import java.io.Reader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;

final class Delivery implements AutoCloseable {
    private static final System.Logger LOG = System.getLogger("IGSO");
    private final ArrayBlockingQueue<String> queue = new ArrayBlockingQueue<>(120);
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    private final URI endpoint;
    private final String key;
    final UUID serverId;
    final int interval;
    private final Thread worker;
    private long nextWarning;

    Delivery(Path file) throws IOException {
        Properties config = new Properties();
        try (Reader input = Files.newBufferedReader(file)) {
            config.load(input);
        }
        endpoint = URI.create(config.getProperty("endpoint", "").trim());
        boolean loopback = "localhost".equalsIgnoreCase(endpoint.getHost()) ||
                "127.0.0.1".equals(endpoint.getHost()) || "[::1]".equals(endpoint.getHost());
        if (endpoint.getHost() == null || endpoint.getUserInfo() != null ||
                !("https".equals(endpoint.getScheme()) || loopback && "http".equals(endpoint.getScheme()))) {
            throw new IllegalArgumentException("Use HTTPS or a loopback HTTP endpoint.");
        }
        serverId = UUID.fromString(config.getProperty("server-id", "").trim());
        key = config.getProperty("agent-key", "").trim();
        interval = Integer.parseInt(config.getProperty("interval-seconds", "2").trim());
        if (!key.matches("[a-f0-9]{64}") || interval < 1 || interval > 5) {
            throw new IllegalArgumentException("Check agent-key and interval-seconds.");
        }
        worker = new Thread(this::sendQueued, "igso-delivery");
        worker.setDaemon(true);
        worker.start();
    }

    void add(String sample) {
        if (!queue.offer(sample)) {
            // Prefer recent measurements when a long outage fills the queue.
            queue.poll();
            queue.offer(sample);
            warn("Queue full; dropped the oldest waiting sample.");
        }
    }

    private synchronized void warn(String message) {
        if (System.nanoTime() >= nextWarning) {
            LOG.log(System.Logger.Level.WARNING, message);
            nextWarning = System.nanoTime() + Duration.ofMinutes(1).toNanos();
        }
    }

    private void sendQueued() {
        try {
            while (!Thread.currentThread().isInterrupted()) {
                String sample = queue.take();
                HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(4))
                        .header("Content-Type", "application/json").header("Authorization", "Bearer " + key)
                        .POST(HttpRequest.BodyPublishers.ofString(sample)).build();
                int delay = 1;
                while (true) {
                    try {
                        int status = client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
                        if (status >= 200 && status < 300) break;
                        if (status != 408 && status != 429 && status < 500) {
                            warn("Collector rejected a sample (HTTP " + status + "). Check the server configuration.");
                            break;
                        }
                    } catch (IOException ignored) {
                        // A lost response can mean the sample was already stored. Retry the same ID.
                    }
                    warn("Collector unavailable; retrying queued measurements.");
                    Thread.sleep(delay * 1000L);
                    delay = Math.min(8, delay * 2);
                }
            }
        } catch (InterruptedException stopped) {
            Thread.currentThread().interrupt();
        }
    }

    @Override public void close() {
        worker.interrupt();
        queue.clear();
    }
}
