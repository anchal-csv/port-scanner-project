import socket
import concurrent.futures
import time

SERVICE_MAP = {
    21: "FTP", 22: "SSH", 80: "HTTP", 443: "HTTPS", 3306: "MySQL",
    8080: "HTTP Alt", 27017: "MongoDB"
}

TOP_COMMON_PORTS = [21, 22, 80, 443, 3306, 8080, 27017]

def get_service(port):
    return SERVICE_MAP.get(port, "Unknown")

def scan_port(host, port):
    try:
        sock = socket.socket()
        sock.settimeout(1)
        result = sock.connect_ex((host, port))
        sock.close()
        return {
            "port": port,
            "status": "open" if result == 0 else "closed",
            "service": get_service(port)
        }
    except:
        return {"port": port, "status": "closed", "service": "Unknown"}

def scan_ports(ip, use_common, port_start, port_end):
    if use_common:
        ports = TOP_COMMON_PORTS
    else:
        ports = list(range(int(port_start), int(port_end) + 1))

    results = []
    start = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as executor:
        futures = [executor.submit(scan_port, ip, p) for p in ports]
        for f in concurrent.futures.as_completed(futures):
            results.append(f.result())

    results.sort(key=lambda x: x["port"])

    return {
        "ip": ip,
        "results": results,
        "open_count": sum(1 for r in results if r["status"] == "open"),
        "total_scanned": len(results),
        "elapsed": round(time.time() - start, 2)
    }