const WEB_SALT = "NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt";
const WX_APPID = "wx48db31d50e334801";
const MUSICU = "https://u.y.qq.com/cgi-bin/musicu.fcg";
export const KUGOU_EDITIONS = {
    standard: { appid: "1005", clientver: "20489", label: "酷狗标准版" },
    concept: { appid: "3116", clientver: "11440", label: "酷狗概念版" },
} as const;

export type KugouEdition = keyof typeof KUGOU_EDITIONS;

function md5(value: string) {
    const bytes = unescape(encodeURIComponent(value));
    const words = [];
    for (let i = 0; i < bytes.length; i++) words[i >> 2] |= bytes.charCodeAt(i) << ((i % 4) * 8);
    const bitLength = bytes.length * 8;
    words[bitLength >> 5] |= 0x80 << (bitLength % 32);
    words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    const rounds = [
        (x, y, z) => (x & y) | (~x & z),
        (x, y, z) => (x & z) | (y & ~z),
        (x, y, z) => x ^ y ^ z,
        (x, y, z) => y ^ (x | ~z),
    ];
    const shifts = [
        [7, 12, 17, 22],
        [5, 9, 14, 20],
        [4, 11, 16, 23],
        [6, 10, 15, 21],
    ];
    const constants = new Array(64).fill(0).map((_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000));
    const rotate = (x, n) => (x << n) | (x >>> (32 - n));
    for (let i = 0; i < words.length; i += 16) {
        let aa = a, bb = b, cc = c, dd = d;
        for (let j = 0; j < 64; j++) {
            const group = Math.floor(j / 16);
            const index = j < 16 ? j : j < 32 ? (5 * j + 1) % 16 : j < 48 ? (3 * j + 5) % 16 : (7 * j) % 16;
            const mixed = rounds[group](bb, cc, dd);
            const next = dd;
            dd = cc;
            cc = bb;
            bb = (bb + rotate((aa + mixed + (words[i + index] | 0) + constants[j]) | 0, shifts[group][j % 4])) | 0;
            aa = next;
        }
        a = (a + aa) | 0;
        b = (b + bb) | 0;
        c = (c + cc) | 0;
        d = (d + dd) | 0;
    }
    return [a, b, c, d].map((word) => [0, 8, 16, 24].map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
}

function signWeb(params: Record<string, string>) {
    const pairs = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join("");
    return md5(WEB_SALT + pairs + WEB_SALT);
}

async function getText(url: string, headers: Record<string, string> = {}) {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
}

async function getJson(url: string, headers: Record<string, string> = {}) {
    return JSON.parse(await getText(url, headers));
}

function guid() {
    const raw = crypto.getRandomValues(new Uint8Array(16));
    raw[6] = (raw[6] & 0x0f) | 0x40;
    raw[8] = (raw[8] & 0x3f) | 0x80;
    const hex = Array.from(raw, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function midOf(seed: string) {
    const hex = md5(seed);
    let value = 0n;
    for (const char of hex) value = (value << 4n) + BigInt(parseInt(char, 16));
    return value.toString();
}

export async function beginKugouQr(edition: KugouEdition) {
    const spec = KUGOU_EDITIONS[edition];
    const device = guid();
    const params: Record<string, string> = {
        dfid: "-",
        mid: midOf(device),
        uuid: "-",
        appid: "1001",
        clientver: spec.clientver,
        clienttime: String(Math.floor(Date.now() / 1000)),
        type: "1",
        plat: "4",
        qrcode_txt: `https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=${spec.appid}&`,
        srcappid: "2919",
    };
    params.signature = signWeb(params);
    const body = await getJson("https://login-user.kugou.com/v2/qrcode?" + new URLSearchParams(params), {
        "User-Agent": "Mozilla/5.0",
    });
    const key = String(body?.data?.qrcode || "");
    if (!key) throw new Error(body?.error || "未能获取酷狗二维码");
    return {
        key,
        device,
        mid: params.mid,
        url: "https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=" + encodeURIComponent(key),
    };
}

export async function pollKugouQr(edition: KugouEdition, key: string, mid: string, device: string) {
    const spec = KUGOU_EDITIONS[edition];
    const params: Record<string, string> = {
        dfid: "-",
        mid,
        uuid: "-",
        appid: spec.appid,
        clientver: spec.clientver,
        clienttime: String(Math.floor(Date.now() / 1000)),
        plat: "4",
        srcappid: "2919",
        qrcode: key,
    };
    params.signature = signWeb(params);
    const body = await getJson("https://login-user.kugou.com/v2/get_userinfo_qrcode?" + new URLSearchParams(params), {
        "User-Agent": "Mozilla/5.0",
    });
    const status = Number(body?.data?.status || 0);
    if (status === 2 || status === 3) return { status: "scanned" as const };
    if (status === -1 || status === 5 || status === 6) return { status: "expired" as const };
    if (status !== 4) return { status: "waiting" as const };
    const token = String(body?.data?.token || "");
    const userid = String(body?.data?.userid || "");
    if (!token || !userid || userid === "0") return { status: "failed" as const, message: "登录成功但没有 token" };
    const nickname = String(body?.data?.nickname || body?.data?.username || userid);
    const cookie = [
        `appid=${spec.appid}`,
        `userid=${userid}`,
        `KugooID=${userid}`,
        `token=${token}`,
        `t=${token}`,
        `KUGOU_API_MID=${mid}`,
        `KUGOU_API_GUID=${device}`,
    ].join("; ");
    return { status: "success" as const, cookie, nickname };
}

export async function beginQqQr() {
    const query = "appid=" + WX_APPID
        + "&redirect_uri=" + encodeURIComponent("https://y.qq.com/portal/wx_redirect.html?login_type=2&surl=https://y.qq.com/")
        + "&response_type=code&scope=snsapi_login&state=STATE";
    const html = await getText("https://open.weixin.qq.com/connect/qrconnect?" + query, {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://open.weixin.qq.com/",
    });
    const match = /uuid=([A-Za-z0-9_-]+)/.exec(html);
    if (!match) throw new Error("未能获取微信登录二维码");
    return {
        uuid: match[1],
        image: "https://open.weixin.qq.com/connect/qrcode/" + match[1],
        url: "https://open.weixin.qq.com/connect/confirm?uuid=" + match[1],
    };
}

export async function pollQqQr(uuid: string) {
    let text = "";
    try {
        text = await getText("https://lp.open.weixin.qq.com/connect/l/qrconnect?uuid=" + encodeURIComponent(uuid) + "&_=" + Date.now(), {
            "User-Agent": "Mozilla/5.0",
            Referer: "https://open.weixin.qq.com/",
        });
    } catch {
        return { status: "waiting" as const };
    }
    const match = /window\.wx_errcode=(\d+);window\.wx_code='([^']*)'/.exec(text);
    if (!match) return { status: "waiting" as const };
    const code = Number(match[1]);
    if (code === 404) return { status: "scanned" as const };
    if (code === 402 || code === 403) return { status: "expired" as const };
    if (code !== 405 || !match[2]) return { status: "waiting" as const };
    const response = await fetch(MUSICU, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Referer: "https://y.qq.com/",
            "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify({
            comm: { tmeLoginType: 1, format: "json", inCharset: "utf-8", outCharset: "utf-8" },
            req_1: {
                module: "music.login.LoginServer",
                method: "Login",
                param: { code: match[2], strAppid: WX_APPID },
            },
        }),
    });
    if (!response.ok) return { status: "failed" as const, message: `HTTP ${response.status}` };
    const body = await response.json();
    const data = body?.req_1?.data || {};
    const key = String(data.musickey || "");
    const id = String(data.musicid || data.str_musicid || data.uin || "");
    if (!key || !id) return { status: "failed" as const, message: "微信登录未返回有效凭据" };
    const loginType = String(data.loginType || 1);
    const cookie = `uin=${id}; musicid=${id}; musickey=${key}; qqmusic_key=${key}; qm_keyst=${key}; tmeLoginType=${loginType}`;
    return {
        status: "success" as const,
        cookie,
        nickname: String(data.nick || data.nickname || id),
    };
}
