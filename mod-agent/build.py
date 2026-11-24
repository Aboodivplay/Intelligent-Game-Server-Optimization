"""Build one server mod with the matching loader's Gradle project (Python 3.9+)."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
import zipfile

source = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("loader", choices=["forge", "fabric"])
parser.add_argument("version", choices=["1.20.1", "26.3"])
parser.add_argument("--out", type=Path, default=Path.cwd())
args = parser.parse_args()
legacy = args.version == "1.20.1"
forge = args.loader == "forge"
target = args.loader + "-" + args.version
forge_build = args.version + ("-47.1.0" if legacy else "-66.1.5")
forge_maven = "https://maven.minecraftforge.net/net/minecraftforge/forge"
fabric_template = "7cc83aa9cb1f145c4d717bce3413e67a6e5f4678"
url = (f"{forge_maven}/{forge_build}/forge-{forge_build}-mdk.zip" if forge else
       f"https://codeload.github.com/FabricMC/fabric-example-mod/zip/{fabric_template}")

with tempfile.TemporaryDirectory(prefix="igso-build-") as temp:
    root = Path(temp)
    bundle = root / "kit.zip"
    # Forge also publishes the kit through its explicit releases repository.
    urls = [url]
    if forge:
        urls.append(url.replace("maven.minecraftforge.net/", "maven.minecraftforge.net/releases/"))
    for address in urls:
        try:
            request = urllib.request.Request(address, headers={"User-Agent": "IGSO-Mod-Build/1.0"})
            with urllib.request.urlopen(request, timeout=45) as response, bundle.open("wb") as out:
                shutil.copyfileobj(response, out)
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
    for folder in ["common", "game-" + args.version, target if forge else "fabric"]:
        for file in (source / folder).glob("*.java"):
            shutil.copyfile(file, java / file.name)
    resources = root / "src/main/resources"
    resources.mkdir(parents=True)
    if forge:
        (resources / "META-INF").mkdir()
        shutil.copyfile(source / target / "mods.toml", resources / "META-INF/mods.toml")
        # Some MDKs expand the project name in their default run configuration.
        with (root / "gradle.properties").open("a") as props:
            props.write("\nmod_id=igso_monitor\nmod_name=IGSO Server Monitor\nmod_group_id=edu.petra.igso.mods\nmod_version=1.0.0\n")
    else:
        shutil.copyfile(source / ("game-" + args.version) / "fabric.mod.json", resources / "fabric.mod.json")
        plugin = "net.fabricmc.fabric-loom-remap" if legacy else "net.fabricmc.fabric-loom"
        dependency = "modImplementation" if legacy else "implementation"
        mapping = "mappings loom.officialMojangMappings()" if legacy else ""
        fabric_api = "0.92.5+1.20.1" if legacy else "0.166.2+26.3"
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
tasks.withType(JavaCompile).configureEach {{ options.release = {17 if legacy else 25} }}
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
    print(dest)
