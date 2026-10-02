import qrcode from "./qrcode.js";
import {
    beginKugouQr,
    beginQqQr,
    pollKugouQr,
    pollQqQr,
    KugouEdition,
    KUGOU_EDITIONS,
} from "../login";

function qrImage(text: string) {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createDataURL(4, 8);
}

type LoginKind = { kind: "qq" } | { kind: "kugou"; edition: KugouEdition };

export function QrLogin({
    login,
    label,
    hint,
    onCookie,
}: {
    login: LoginKind;
    label: string;
    hint: string;
    onCookie: (cookie: string) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const [image, setImage] = React.useState("");
    const [status, setStatus] = React.useState("");
    const [name, setName] = React.useState("");
    const stop = React.useRef(false);

    React.useEffect(() => () => {
        stop.current = true;
    }, []);

    const start = async () => {
        stop.current = false;
        setOpen(true);
        setName("");
        setStatus("正在获取二维码");
        try {
            if (login.kind === "qq") {
                const session = await beginQqQr();
                if (stop.current) return;
                setImage(session.image || qrImage(session.url));
                setStatus("用微信扫码并确认");
                while (!stop.current) {
                    const result = await pollQqQr(session.uuid);
                    if (stop.current) return;
                    if (result.status === "scanned") setStatus("已扫码，请在手机上确认");
                    if (result.status === "expired") {
                        setStatus("二维码已过期");
                        return;
                    }
                    if (result.status === "failed") {
                        setStatus(result.message || "登录失败");
                        return;
                    }
                    if (result.status === "success") {
                        onCookie(result.cookie);
                        setName(result.nickname);
                        setStatus("已登录");
                        return;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
                return;
            }
            const session = await beginKugouQr(login.edition);
            if (stop.current) return;
            setImage(qrImage(session.url));
            setStatus(`用${KUGOU_EDITIONS[login.edition].label} App 扫码并确认`);
            while (!stop.current) {
                const result = await pollKugouQr(login.edition, session.key, session.mid, session.device);
                if (stop.current) return;
                if (result.status === "scanned") setStatus("已扫码，请在手机上确认");
                if (result.status === "expired") {
                    setStatus("二维码已过期");
                    return;
                }
                if (result.status === "failed") {
                    setStatus(result.message || "登录失败");
                    return;
                }
                if (result.status === "success") {
                    onCookie(result.cookie);
                    setName(result.nickname);
                    setStatus("已登录");
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "获取二维码失败");
        }
    };

    return (
        <div className="qr-login">
            <div className="qr-login-row">
                <button type="button" className="btn" onClick={() => start()}>{label}</button>
                {name ? <span className="qr-login-name">{name}</span> : null}
            </div>
            <div className="note">{hint}</div>
            {open ? (
                <div className="qr-login-panel">
                    {image ? <img className="qr-login-image" src={image} alt="登录二维码" /> : null}
                    <div className="qr-login-status">{status}</div>
                    <button type="button" className="btn" onClick={() => {
                        stop.current = true;
                        setOpen(false);
                    }}>关闭</button>
                </div>
            ) : null}
        </div>
    );
}
