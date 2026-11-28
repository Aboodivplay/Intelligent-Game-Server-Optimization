"""Build one server mod with the matching loader's Gradle project (Python 3.9+)."""
import argparse
import io
import json
import time
import xml.etree.ElementTree as ET
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
import zipfile

source = Path(__file__).resolve().parent
targets = json.loads((source / "targets.json").read_text())
parser = argparse.ArgumentParser()
parser.add_argument("loader", choices=["forge", "fabric"])
parser.add_argument("version", choices=targets)
parser.add_argument("--out", type=Path, default=Path.cwd())
args = parser.parse_args()
game = args.version
options = targets[game]
remap = game.startswith("1.")
java_version = options["java"]
forge = args.loader == "forge"
target = args.loader + "-" + args.version
if forge and options["forge"] is None:
    parser.error(f"Forge has no published loader for Minecraft {game}; use Fabric for this release.")
forge_build = f"{game}-{options['forge']}"
forge_maven = "https://maven.minecraftforge.net/net/minecraftforge/forge"
fabric_template = "7cc83aa9cb1f145c4d717bce3413e67a6e5f4678"
url = (f"{forge_maven}/{forge_build}/forge-{forge_build}-mdk.zip" if forge else
       f"https://codeload.github.com/FabricMC/fabric-example-mod/zip/{fabric_template}")

def fetch(url):
    """Retry transient repository errors without substituting another game version."""
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "IGSO-Mod-Build/1.1"})
            with urllib.request.urlopen(req, timeout=75) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError) as exc:
            if getattr(exc, "code", None) == 404 or attempt == 2:
                raise
            time.sleep(2 ** attempt)


def fabric_api_version():
    # Maven's version suffix identifies the Minecraft release, including short-lived patches.
    xml = fetch("https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/maven-metadata.xml")
    candidates = [v.text for v in ET.fromstring(xml).findall(".//version") if v.text.endswith("+" + game)]
    if candidates:
        return max(candidates, key=lambda v: tuple(int(n) for n in v.split("+")[0].split(".") if n.isdigit()))
    # Some Fabric API releases explicitly support multiple game versions under one Maven name.
    from urllib.parse import urlencode
    query = urlencode({"game_versions": json.dumps([game]), "loaders": '["fabric"]'})
    versions = json.loads(fetch("https://api.modrinth.com/v2/project/fabric-api/version?" + query))
    for release in versions:
        if game in release["game_versions"] and release["version_number"] in {v.text for v in ET.fromstring(xml).findall(".//version")}:
            return release["version_number"]
    raise ValueError("No Fabric API release for " + game)


with tempfile.TemporaryDirectory(prefix="igso-build-") as temp:
    root = Path(temp)
    bundle = root / "kit.zip"
    # Forge also publishes the kit through its explicit releases repository.
    urls = [url]
    if forge:
        urls.append(url.replace("maven.minecraftforge.net/", "maven.minecraftforge.net/releases/"))
    for address in urls:
        try:
            bundle.write_bytes(fetch(address))
            break
        except urllib.error.HTTPError as error:
            print(f"Development kit download returned HTTP {error.code} at {address}", flush=True)
            if address == urls[-1]:
                raise
    with zipfile.ZipFile(bundle) as archive:
        for item in archive.infolist():
            parts = Path(item.filename).parts
            if not forge:
                parts = parts[1:]
            if not parts or item.is_dir() or ".." in parts:
                continue
            if parts[0] not in {"gradlew","gradlew.bat","gradle","build.gradle","gradle.properties","settings.gradle"}:
                continue
            dest = root.joinpath(*parts)
            dest.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(item) as src, dest.open("wb") as dst:
                shutil.copyfileobj(src, dst)

    java = root / "src/main/java/edu/petra/igso/mods"
    java.mkdir(parents=True)
    for file in (source / "common").glob("*.java"):
        shutil.copyfile(file, java / file.name)
    # Minecraft added nanosecond tick reporting in 1.20.3.
    metrics_template = "1.20.1" if game in ("1.20.1","1.20.2") else "26.3"
    metrics = (source / ("game-" + metrics_template) / "WorldMetrics.java").read_text()
    (java / "WorldMetrics.java").write_text(metrics.replace('"' + metrics_template + '"', '"' + game + '"'))
    resources = root / "src/main/resources"
    resources.mkdir(parents=True)
    if forge:
        # Forge changed both how tick listeners are registered and how they access the server.
        prefix = f"{forge_maven}/{forge_build}/forge-{forge_build}"
        with zipfile.ZipFile(io.BytesIO(fetch(prefix + "-sources.jar"))) as published:
            tick = published.read("net/minecraftforge/event/TickEvent.java").decode()
        new_bus = "import net.minecraftforge.eventbus.api.bus.EventBus;" in tick
        entry = "forge-26.3" if new_bus else "forge-1.20.1"
        monitor = (source / entry / "ForgeMonitor.java").read_text()
        if new_bus and "MinecraftServer server();" not in tick:
            monitor = monitor.replace("event.server()", "event.getServer()")
        if not new_bus and "class Post extends ServerTickEvent" in tick:
            monitor = monitor.replace("ServerTickEvent event", "ServerTickEvent.Post event")
            monitor = monitor.replace("if (event.phase == TickEvent.Phase.END) ", "")
        (java / "ForgeMonitor.java").write_text(monitor)
        (resources / "META-INF").mkdir()
        major = int(options["forge"].split(".")[0])
        meta = (source / "forge-26.3/mods.toml").read_text()
        meta = meta.replace("[66,)", f"[{major},)").replace("[26.3]", f"[{game}]")
        meta = meta.replace("[66.1.5,67)", f"[{options['forge']},{major+1})")
        (resources / "META-INF/mods.toml").write_text(meta)
        # Some MDKs expand the project name in their default run configuration.
        with (root / "gradle.properties").open("a") as props:
            props.write("\nmod_id=igso_monitor\nmod_name=IGSO Server Monitor\nmod_group_id=edu.petra.igso.mods\nmod_version=1.0.0\n")
    else:
        shutil.copyfile(source / "fabric/FabricMonitor.java", java / "FabricMonitor.java")
        meta = json.loads((source / "game-26.3/fabric.mod.json").read_text())
        meta["depends"].update(minecraft=game, java=f">={java_version}")
        (resources / "fabric.mod.json").write_text(json.dumps(meta, indent=2))
        plugin = "net.fabricmc.fabric-loom-remap" if remap else "net.fabricmc.fabric-loom"
        dependency = "modImplementation" if remap else "implementation"
        mapping = "mappings loom.officialMojangMappings()" if remap else ""
        fabric_api = fabric_api_version()
        print(f"Compiling against Fabric API {fabric_api} for {game}", flush=True)
        (root / "settings.gradle").write_text("""
pluginManagement {
    repositories {
        maven { url = 'https://maven.fabricmc.net/' }
        gradlePluginPortal()
    }
}
rootProject.name = 'igso-monitor'
""")
        (root / "gradle.properties").write_text("org.gradle.jvmargs=-Xmx2G\n")
        (root / "build.gradle").write_text(f"""
plugins {{ id '{plugin}' version '1.19.4' }}
group = 'edu.petra.igso'
version = '1.0.0'
dependencies {{
    minecraft 'com.mojang:minecraft:{args.version}'
    {mapping}
    {dependency} 'net.fabricmc:fabric-loader:0.20.1'
    {dependency} 'net.fabricmc.fabric-api:fabric-api:{fabric_api}'
}}
tasks.withType(JavaCompile).configureEach {{ options.release = {java_version} }}
""")
    wrapper = root / ("gradlew.bat" if os.name == "nt" else "gradlew")
    wrapper.chmod(0o755)
    subprocess.run([str(wrapper), "--no-daemon", "build"], cwd=root, check=True)
    artifacts = [p for p in (root / "build/libs").glob("*.jar")
                 if not p.name.endswith(("-sources.jar", "-javadoc.jar", "-dev.jar", "-slim.jar"))]
    if len(artifacts) != 1:
        raise RuntimeError("Expected one release JAR; found " + str(artifacts))
    args.out.mkdir(parents=True, exist_ok=True)
    dest = args.out / ("igso-" + target + ".jar")
    shutil.copyfile(artifacts[0], dest)
    # A ZIP provides a browser-friendly alternative and contains the exact same installable JAR.
    with zipfile.ZipFile(dest.with_suffix(".zip"), "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(dest, dest.name)
    print(dest)
