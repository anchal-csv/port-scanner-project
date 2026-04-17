from flask import Flask, request, jsonify, render_template
import socket
import concurrent.futures
import time

app = Flask(__name__)

SERVICE_MAP = {
    20: "FTP Data", 21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP",
    53: "DNS", 67: "DHCP", 68: "DHCP", 69: "TFTP", 80: "HTTP",
    110: "POP3", 119: "NNTP", 123: "NTP", 135: "MS RPC", 137: "NetBIOS",
    138: "NetBIOS", 139: "NetBIOS", 143: "IMAP", 161: "SNMP", 194: "IRC",
    389: "LDAP", 443: "HTTPS", 445: "SMB", 465: "SMTPS", 514: "Syslog",
    587: "SMTP (Submission)", 636: "LDAPS", 993: "IMAPS", 995: "POP3S",
    1080: "SOCKS Proxy", 1194: "OpenVPN", 1433: "MSSQL", 1521: "Oracle DB",
    1723: "PPTP", 2049: "NFS", 2181: "ZooKeeper", 3000: "Node.js / Grafana",
    3306: "MySQL", 3389: "RDP", 4369: "RabbitMQ", 5000: "Flask / UPnP",
    5432: "PostgreSQL", 5900: "VNC", 5984: "CouchDB", 6379: "Redis",
    6443: "Kubernetes API", 7001: "WebLogic", 8080: "HTTP Alternate",
    8443: "HTTPS Alternate", 8888: "Jupyter", 9000: "SonarQube / PHP-FPM",
    9042: "Cassandra", 9090: "Prometheus", 9200: "Elasticsearch",
    9300: "Elasticsearch Cluster", 11211: "Memcached", 27017: "MongoDB",
    27018: "MongoDB", 50000: "SAP",
}

TOP_COMMON_PORTS = [
    21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143,
    161, 194, 389, 443, 445, 465, 587, 636, 993, 995,
    1080, 1194, 1433, 1521, 1723, 2049, 3000, 3306, 3389,
    5000, 5432, 5900, 5984, 6379, 6443, 8080, 8443, 8888,
    9000, 9090, 9200, 11211, 27017,
]


def get_service(port):
    return SERVICE_MAP.get(port, "Unknown")


def scan_port(host, port, timeout=1.0):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        status = "open" if result == 0 else "closed"
    except socket.error:
        status = "closed"
    return {"port": port, "status": status, "service": get_service(port)}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/scan", methods=["POST"])
def scan():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON body."}), 400

    target = data.get("target", "").strip()
    port_start = data.get("port_start")
    port_end = data.get("port_end")
    use_common = data.get("use_common", False)

    if not target:
        return jsonify({"error": "Target is required."}), 400

    try:
        ip = socket.gethostbyname(target)
    except socket.gaierror:
        return jsonify({"error": f"Could not resolve host: '{target}'"}), 400

    if use_common:
        ports = TOP_COMMON_PORTS
    else:
        try:
            port_start = int(port_start)
            port_end = int(port_end)
        except (TypeError, ValueError):
            return jsonify({"error": "Port range must be valid integers."}), 400

        if not (0 <= port_start <= 65535) or not (0 <= port_end <= 65535):
            return jsonify({"error": "Ports must be between 0 and 65535."}), 400

        if port_start > port_end:
            return jsonify({"error": "Start port must be <= end port."}), 400

        if (port_end - port_start) > 5000:
            return jsonify({"error": "Port range too large. Maximum is 5000 ports."}), 400

        ports = list(range(port_start, port_end + 1))

    results = []
    start_time = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=150) as executor:
        futures = {executor.submit(scan_port, ip, port): port for port in ports}
        for future in concurrent.futures.as_completed(futures):
            try:
                results.append(future.result())
            except Exception:
                port = futures[future]
                results.append({"port": port, "status": "error", "service": get_service(port)})

    results.sort(key=lambda x: x["port"])
    elapsed = round(time.time() - start_time, 2)
    open_count = sum(1 for r in results if r["status"] == "open")

    return jsonify({
        "target": target,
        "ip": ip,
        "elapsed": elapsed,
        "total_scanned": len(results),
        "open_count": open_count,
        "results": results
    })


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)