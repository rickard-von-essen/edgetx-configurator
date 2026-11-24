"""Reproduce the curated fixtures from private inputs using Python 3's standard library."""

import argparse
import binascii
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile


ROOT = Path(__file__).resolve().parent
VERSION = b"2.12.4"


def replace_scalar(data, key, value):
    pattern = rb"(?m)^(" + re.escape(key) + rb":[ \t]*)[^\r\n]*(\r?)$"
    result, count = re.subn(
        pattern, lambda match: match[1] + value + match[2], data
    )
    if count != 1:
        raise ValueError(f"Expected exactly one {key.decode()} field")
    return result


def check_version(data):
    if not re.search(rb"(?m)^semver: " + re.escape(VERSION) + rb"\r?$", data):
        raise ValueError("Expected a v2.12.4 source document")


def radio_checksum(data):
    header, separator, body = data.partition(b"\n")
    match = re.fullmatch(rb"checksum: +(\d+)\r?", header)
    if not separator or not match:
        raise ValueError("Missing native checksum header")
    return int(match[1]), binascii.crc_hqx(body, 0xFFFF)


def sanitize_radio(data):
    check_version(data)
    actual, expected = radio_checksum(data)
    if actual != expected:
        raise ValueError("Original radio settings checksum does not match")
    if not re.search(rb"(?m)^board: pocket\r?$", data):
        raise ValueError("Expected the Pocket board")

    data = replace_scalar(data, b"ownerRegistrationID", b'""')
    data = replace_scalar(data, b"globalTimer", b"0")
    data = replace_scalar(data, b"currModel", b"7")
    data, count = re.subn(
        rb"(?m)^([ \t]+(?:mid|spanNeg|spanPos):[ \t]*)-?\d+(\r?)$",
        lambda match: match[1] + b"1024" + match[2],
        data,
    )
    if count != 15:
        raise ValueError("Expected calibration for exactly five analog controls")

    header, _, body = data.partition(b"\n")
    checksum = str(binascii.crc_hqx(body, 0xFFFF)).encode()
    header = re.sub(rb"\d+", checksum, header, count=1)
    return header + b"\n" + body


def sanitize_model(data):
    check_version(data)
    if not re.search(rb'(?m)^ +name: "?Trainer"?\r?$', data):
        raise ValueError("Expected the selected Trainer model")
    return replace_scalar(data, b"modelRegistrationID", b'""')


def fingerprint(data):
    return {"size": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def prepare(source):
    sources = {
        "radio-original/RADIO/radio.yml": (
            source / "radio-original/RADIO/radio.yml"
        ).read_bytes(),
        "radio-original/MODELS/model07.yml": (
            source / "radio-original/MODELS/model07.yml"
        ).read_bytes(),
        "pocket-companion.etx": (source / "pocket-companion.etx").read_bytes(),
        "provenance.txt": (source / "provenance.txt").read_bytes(),
    }
    if b"2.12.4" not in sources["provenance.txt"] or b"ELRS" not in sources["provenance.txt"]:
        raise ValueError("Provenance must identify the supplied v2.12.4 ELRS capture")

    members = {}
    with zipfile.ZipFile(io.BytesIO(sources["pocket-companion.etx"])) as archive:
        for name in ("RADIO/radio.yml", "MODELS/model07.yml"):
            matches = [item for item in archive.infolist() if item.filename == name]
            if len(matches) != 1 or matches[0].file_size > 64 * 1024:
                raise ValueError(f"Unexpected archive member: {name}")
            members[name] = archive.read(matches[0])

    files = {
        "native/RADIO/radio.yml": sanitize_radio(sources["radio-original/RADIO/radio.yml"]),
        "native/MODELS/model07.yml": sanitize_model(sources["radio-original/MODELS/model07.yml"]),
        "companion/RADIO/radio.yml": sanitize_radio(members["RADIO/radio.yml"]),
        "companion/MODELS/model07.yml": sanitize_model(members["MODELS/model07.yml"]),
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        for name in ("RADIO/radio.yml", "MODELS/model07.yml"):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 0
            info.compress_type = zipfile.ZIP_STORED
            archive.writestr(info, files["companion/" + name])
    files["companion/pocket.etx"] = output.getvalue()

    native_model = files["native/MODELS/model07.yml"]
    newline = b"\r\n" if b"\r\n" in native_model else b"\n"
    invalid_checksum = files["native/RADIO/radio.yml"]
    checksum, _ = radio_checksum(invalid_checksum)
    files.update({
        "cases/empty.yml": b"",
        "cases/invalid.yml": b"semver: 2.12.4\nheader: [\n",
        "cases/unsupported-version.yml": b"semver: 255.255.255\nheader:\n  name: Future\n",
        "cases/unknown-field.yml": native_model + newline.join([
            b"fixtureFutureField:", b"   enabled: true", b'   label: "preserve exactly"', b"",
        ]),
        "cases/checksum-mismatch.yml": replace_scalar(
            invalid_checksum, b"checksum", str(checksum % 65535 + 1).encode()
        ),
    })

    private_ids = set()
    for data in [*sources.values(), *members.values()]:
        for match in re.finditer(rb'(?m)^(?:owner|model)RegistrationID: *"?([^"\r\n]+)"?\r?$', data):
            private_ids.add(match[1].strip())
    if any(value and value in data for value in private_ids for data in files.values()):
        raise ValueError("A source registration identifier remains in the output")

    expectations = {
        "empty.yml": "empty-document",
        "invalid.yml": "invalid-yaml",
        "unsupported-version.yml": "unsupported-version",
        "unknown-field.yml": "preserve-unknown-field",
        "checksum-mismatch.yml": "checksum-mismatch",
    }
    manifest = {
        "manifestVersion": 1,
        "profile": "pocket-elrs-2.12.4",
        "license": "GPL-2.0",
        "sources": [
            {"path": name, **fingerprint(data)}
            for name, data in sorted(sources.items())
        ],
        "files": [
            {
                "path": name,
                **fingerprint(data),
                "expected": expectations.get(Path(name).name, "sanitized-positive"),
            }
            for name, data in sorted(files.items())
        ],
    }
    return files, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Private pocket-fixtures directory")
    parser.add_argument("--check", action="store_true", help="Compare without writing")
    args = parser.parse_args()
    if args.source.resolve() == ROOT:
        parser.error("The private input directory must differ from the curated output")
    files, manifest = prepare(args.source)

    if args.check:
        for name, data in files.items():
            if (ROOT / name).read_bytes() != data:
                raise ValueError(f"Fixture differs: {name}")
        if json.loads((ROOT / "manifest.json").read_text()) != manifest:
            raise ValueError("Fixture manifest differs")
        print(f"Verified {len(files)} reproducible curated files")
        return

    for name, data in files.items():
        target = ROOT / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Prepared {len(files)} curated files; private inputs were not modified")


if __name__ == "__main__":
    main()
