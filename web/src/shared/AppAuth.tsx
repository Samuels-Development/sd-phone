import { useEffect, useMemo, useRef, useState } from 'react';
import { AtSign, ChevronLeft, Eye, EyeOff, KeyRound, Phone, ShieldCheck, X } from 'lucide-react';

import { t } from '@/i18n';
import { useStatusBarLight } from '@/shell/useStatusBarLight';
import { useIosPush } from '@/hooks/useIosPush';
import { clearSessionState, useSessionState } from '@/hooks/useSessionState';
import { AlertDialog } from '@/ui/AlertDialog';
import { AppIconSVG } from '@/shell/AppIconSVG';
import { formatPhone } from '@/lib/phone';

interface AppAuthField {
    key:         string;
    label:       string;
    type?:       'text' | 'password' | 'email' | 'number' | 'tel';
    suffix?:     string;
    createOnly?: boolean;
    optional?:   boolean;
}

export interface AppAuthTheme {
    accent:      string;
    welcomeBg:   string;
    welcomeText: 'light' | 'dark';
    formBg?:     string;
    welcomeCtaWhite?: boolean;
}

export interface AppAuthProps {
    appName:  string;
    tagline:  string;
    icon?:    string;
    theme:    AppAuthTheme;
    fields:   AppAuthField[];
    onAuthed: (values: Record<string, string>) => void;
    onDismiss?: () => void;
    onSubmit?: (mode: 'create' | 'login', values: Record<string, string>) => Promise<{ ok: boolean; message?: string; field?: string }>;
    onRequestReset?: (identity: string) => Promise<{ ok: boolean; message?: string; channel?: 'email' | 'sms' }>;
    onConfirmReset?: (identity: string, code: string, password: string) => Promise<{ ok: boolean; message?: string }>;
    onSuggestCode?: (identity: string) => Promise<{ code?: string; source?: 'mail' | 'messages' }>;
    onSaveCredentials?: (values: Record<string, string>) => void | Promise<unknown>;
    savedLogin?: { username: string; password: string } | null;
    myNumber?: string | null;
    myEmail?: string | null;
}

type Screen = 'welcome' | 'create' | 'login' | 'reset' | 'resetCode' | 'success';

export function AppAuth({ appName, tagline, icon, theme, fields, onAuthed, onDismiss, onSubmit, onRequestReset, onConfirmReset, onSuggestCode, onSaveCredentials, savedLogin, myNumber, myEmail }: AppAuthProps) {
    const [screen, setScreen] = useSessionState<Screen>(`auth:${appName}:screen`, 'welcome');
    const [resetIdentity, setResetIdentity] = useSessionState<string>(`auth:${appName}:resetIdentity`, '');
    const [notice, setNotice] = useState<string | null>(null);
    const [successMode, setSuccessMode] = useState<'create' | 'login'>('login');
    const pendingValues = useRef<Record<string, string>>({});

    function beginSuccess(mode: 'create' | 'login', values: Record<string, string>) {
        pendingValues.current = values;
        setSuccessMode(mode);
        setScreen('success');
    }

    const [savePrompt, setSavePrompt] = useState(false);
    const onAuthedRef = useRef(onAuthed); onAuthedRef.current = onAuthed;
    const onSaveRef   = useRef(onSaveCredentials); onSaveRef.current = onSaveCredentials;

    function finishAuth(save: boolean) {
        if (save) void onSaveRef.current?.(pendingValues.current);
        setSavePrompt(false);
        clearSessionState(`auth:${appName}:`);
        onAuthedRef.current(pendingValues.current);
    }

    useEffect(() => {
        if (screen !== 'success') return;
        const timer = setTimeout(() => {
            if (successMode === 'create' && onSaveRef.current) setSavePrompt(true);
            else finishAuth(false);
        }, 1500);
        return () => clearTimeout(timer);
    }, [screen, appName, successMode]);

    const [quickBusy, setQuickBusy] = useState(false);
    async function quickLogin() {
        if (!savedLogin || quickBusy) return;
        const values = { username: savedLogin.username, email: savedLogin.username, password: savedLogin.password };
        if (onSubmit) {
            setQuickBusy(true);
            const res = await onSubmit('login', values);
            setQuickBusy(false);
            if (!res.ok) {
                setScreen('login');
                setNotice(res.message ?? t('common.savedLoginFailed', 'The saved login did not work. Enter your password.'));
                return;
            }
        }
        beginSuccess('login', values);
    }

    const welcomeLight = screen === 'welcome' ? theme.welcomeText === 'light' : false;
    useStatusBarLight(welcomeLight);

    const showingDetail = screen !== 'welcome';
    const showingReset  = screen === 'reset' || screen === 'resetCode';

    function go(next: Screen) {
        setNotice(null);
        setScreen(next);
    }

    return (
        <div className="absolute inset-0 z-10 overflow-hidden">
            <div
                className="flex h-full w-[200%] transition-transform duration-300 ease-out"
                style={{ transform: showingDetail ? 'translateX(-50%)' : 'translateX(0)' }}
            >
                <div className="h-full w-1/2 shrink-0">
                    <Welcome
                        appName={appName}
                        tagline={tagline}
                        icon={icon}
                        theme={theme}
                        onCreate={() => go('create')}
                        onLogin={() => go('login')}
                        onForgot={onRequestReset ? () => go('reset') : undefined}
                        onDismiss={onDismiss}
                    />
                </div>
                <div className="h-full w-1/2 shrink-0">
                    {screen === 'success' ? (
                        <SuccessPane appName={appName} theme={theme} mode={successMode} />
                    ) : showingReset ? (
                        <ResetForm
                            phase={screen === 'resetCode' ? 'resetCode' : 'reset'}
                            appName={appName}
                            icon={icon}
                            theme={theme}
                            identity={resetIdentity}
                            onIdentity={setResetIdentity}
                            myNumber={myNumber}
                            onRequestReset={onRequestReset}
                            onConfirmReset={onConfirmReset}
                            onSuggestCode={onSuggestCode}
                            onAdvance={() => setScreen('resetCode')}
                            onBack={() => go(screen === 'resetCode' ? 'reset' : 'welcome')}
                            onDone={() => {
                                setScreen('login');
                                setNotice(t('common.passwordUpdated', 'Password updated. Log in with your new password.'));
                            }}
                        />
                    ) : (
                        <AuthForm
                            key={screen === 'login' ? 'login' : 'create'}
                            mode={screen === 'login' ? 'login' : 'create'}
                            appName={appName}
                            icon={icon}
                            theme={theme}
                            fields={fields}
                            notice={notice}
                            myNumber={myNumber}
                            myEmail={myEmail}
                            savedUsername={savedLogin?.username}
                            quickBusy={quickBusy}
                            onQuickLogin={savedLogin ? () => void quickLogin() : undefined}
                            onBack={() => go('welcome')}
                            onAuthed={vals => beginSuccess(screen === 'login' ? 'login' : 'create', vals)}
                            onSubmit={onSubmit}
                        />
                    )}
                </div>
            </div>

            {savePrompt && (
                <AlertDialog
                    title={t('common.saveToPasswords', 'Save to Passwords?')}
                    message={t('common.savePasswordsBody', 'Keep your {appName} username and password in the Passwords app so you can always find them.', { appName })}
                    confirmLabel={t('common.save', 'Save')}
                    cancelLabel={t('common.notNow', 'Not Now')}
                    onCancel={() => finishAuth(false)}
                    onConfirm={() => finishAuth(true)}
                />
            )}
        </div>
    );
}

function Welcome({ appName, tagline, icon, theme, onCreate, onLogin, onForgot, onDismiss }: {
    appName:  string;
    tagline:  string;
    icon?:    string;
    theme:    AppAuthTheme;
    onCreate: () => void;
    onLogin:  () => void;
    onForgot?: () => void;
    onDismiss?: () => void;
}) {
    const light    = theme.welcomeText === 'light';
    const ctaWhite = !!theme.welcomeCtaWhite;
    return (
        <div
            className={`relative flex h-full flex-col ${light ? 'text-white' : 'text-black'}`}
            style={{ background: theme.welcomeBg }}
        >
            <div className="h-[54px] shrink-0" aria-hidden />
            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label={t('common.close', 'Close')}
                    className="absolute right-4 top-[60px] z-10 flex h-9 w-9 items-center justify-center rounded-full active:opacity-70"
                    style={{ background: light ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.06)' }}
                >
                    <X className="h-5 w-5" strokeWidth={2.2} />
                </button>
            )}
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                {icon && (
                    <div
                        className="h-20 w-20 overflow-hidden rounded-[18px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                        style={{ boxShadow: '0 10px 28px rgba(0,0,0,0.22)' }}
                    >
                        <AppIconSVG icon={icon} />
                    </div>
                )}
                <h1 className="mt-6 text-[36px] font-extrabold leading-none">{appName}</h1>
                <p className="mt-2.5 text-[16px] font-medium leading-snug" style={{ color: light ? 'rgba(255,255,255,0.78)' : 'rgba(0,0,0,0.65)' }}>
                    {tagline}
                </p>
            </div>
            <div className="px-6 pb-10">
                <button
                    type="button"
                    onClick={onCreate}
                    className="w-full rounded-full py-4 text-[17px] font-bold active:opacity-90"
                    style={ctaWhite
                        ? { background: '#ffffff', color: theme.accent }
                        : { background: theme.accent, color: '#ffffff' }}
                >
                    {t('common.createAccount', 'Create account')}
                </button>
                <button
                    type="button"
                    onClick={onLogin}
                    className="mt-3 w-full rounded-full py-4 text-[17px] font-bold active:opacity-80"
                    style={ctaWhite
                        ? { background: 'transparent', color: '#ffffff', border: '1.5px solid rgba(255,255,255,0.85)' }
                        : { background: light ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)', color: theme.accent }}
                >
                    {t('common.logIn', 'Log in')}
                </button>
                {onForgot && (
                    <button
                        type="button"
                        onClick={onForgot}
                        className="mt-4 w-full px-6 text-center text-[14px] font-semibold leading-snug active:opacity-70"
                        style={{ color: ctaWhite ? '#ffffff' : theme.accent }}
                    >
                        {t('common.forgotPassword', 'Forgot your password? Tap here to recover your account')}
                    </button>
                )}
            </div>
        </div>
    );
}

function SuccessPane({ appName, theme, mode }: {
    appName: string;
    theme:   AppAuthTheme;
    mode:    'create' | 'login';
}) {
    const formBg = theme.formBg ?? '#f2f3f5';
    return (
        <div className="flex h-full flex-col items-center justify-center text-black" style={{ background: formBg }}>
            <style>{`
                @keyframes appauth-pop  { 0% { transform: scale(0.35); opacity: 0; } 65% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
                @keyframes appauth-draw { 0% { stroke-dashoffset: 36; } 100% { stroke-dashoffset: 0; } }
                @keyframes appauth-rise { 0% { transform: translateY(10px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
            `}</style>
            <div
                className="flex h-[76px] w-[76px] items-center justify-center rounded-full"
                style={{ background: theme.accent, boxShadow: `0 12px 30px ${theme.accent}55`, animation: 'appauth-pop 0.5s cubic-bezier(0.2,1.4,0.4,1) both 0.1s' }}
            >
                <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="36" strokeDashoffset="36" style={{ animation: 'appauth-draw 0.35s ease-out forwards 0.5s' }} />
                </svg>
            </div>
            <div className="mt-6 text-[23px] font-extrabold tracking-tight" style={{ animation: 'appauth-rise 0.35s ease-out both 0.55s' }}>
                {mode === 'create' ? t('common.accountCreated', 'Account created') : t('common.welcomeBack', 'Welcome back')}
            </div>
            <div className="mt-1.5 text-[14px] font-medium text-black/45" style={{ animation: 'appauth-rise 0.35s ease-out both 0.68s' }}>
                {t('common.takingYouTo', 'Taking you to {appName}', { appName })}
            </div>
        </div>
    );
}

function generateStrongPassword() {
    const lowers = 'abcdefghijkmnpqrstuvwxyz';
    const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const pick = (set: string) => set.charAt(Math.floor(Math.random() * set.length));
    const chars = Array.from({ length: 18 }, () => pick(lowers));
    const u = Math.floor(Math.random() * 18);
    let d = Math.floor(Math.random() * 18);
    if (d === u) d = (d + 1) % 18;
    chars[u] = pick(uppers);
    chars[d] = pick(digits);
    const group = (start: number) => chars.slice(start, start + 6).join('');
    return `${group(0)}-${group(6)}-${group(12)}`;
}

function AuthForm({ mode, appName, icon, theme, fields, notice, myNumber, myEmail, savedUsername, quickBusy, onQuickLogin, onBack, onAuthed, onSubmit }: {
    mode:     'create' | 'login';
    appName:  string;
    icon?:    string;
    theme:    AppAuthTheme;
    fields:   AppAuthField[];
    notice?:  string | null;
    myNumber?: string | null;
    myEmail?: string | null;
    savedUsername?: string;
    quickBusy?: boolean;
    onQuickLogin?: () => void;
    onBack:   () => void;
    onAuthed: (values: Record<string, string>) => void;
    onSubmit?: (mode: 'create' | 'login', values: Record<string, string>) => Promise<{ ok: boolean; message?: string; field?: string }>;
}) {
    const isCreate = mode === 'create';
    const hasPassword = isCreate && fields.some(f => f.type === 'password');

    const shown = useMemo<AppAuthField[]>(() => {
        if (isCreate) return fields;
        let identity = fields.find(f => f.type !== 'password');
        if (identity && !identity.suffix) identity = { ...identity, label: t('common.usernameOrEmail', 'Username or email'), type: 'text' };
        const password = fields.find(f => f.type === 'password');
        return [identity, password].filter(Boolean) as AppAuthField[];
    }, [isCreate, fields]);

    const [values, setValues] = useSessionState<Record<string, string>>(`auth:${appName}:formValues`, {});
    const [error,  setError]  = useState<string | null>(null);
    const [busy,   setBusy]   = useState(false);
    const [focusedKey, setFocusedKey] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const inputs = useRef<Record<string, HTMLInputElement | null>>({});
    const [suggestedPw, setSuggestedPw] = useState<string | null>(null);

    const focusedField = focusedKey ? shown.find(f => f.key === focusedKey) : undefined;
    const focusingNewPw = isCreate && focusedField?.type === 'password';
    useEffect(() => {
        if (focusingNewPw) setSuggestedPw(generateStrongPassword());
    }, [focusedKey]);

    let fill: { value: string; display: string; sub: string; icon: React.ReactNode } | null = null;
    if (focusedField && !(values[focusedField.key] ?? '')) {
        if (focusedField.type === 'tel' && myNumber) {
            fill = { value: myNumber, display: formatPhone(myNumber), sub: t('common.fromYourPhoneNumber', 'From your phone number'), icon: <Phone className="h-[20px] w-[20px]" strokeWidth={2.2} /> };
        } else if (focusedField.suffix && myEmail) {
            fill = { value: myEmail.split('@')[0], display: myEmail, sub: t('common.fromYourMailAccount', 'From your Mail account'), icon: <AtSign className="h-[20px] w-[20px]" strokeWidth={2.2} /> };
        } else if (focusingNewPw && suggestedPw) {
            fill = { value: suggestedPw, display: t('common.useStrongPassword', 'Use a strong password'), sub: t('common.createdFor', 'Created for {appName}', { appName }), icon: <KeyRound className="h-[20px] w-[20px]" strokeWidth={2.2} /> };
        }
    }

    const heading = isCreate ? t('common.createAccount', 'Create account') : t('common.logIn', 'Log in');
    const title   = isCreate ? t('common.createYourAccount', 'Create your {appName} account', { appName }) : t('common.logInTo', 'Log in to {appName}', { appName });
    const formBg  = theme.formBg ?? '#f2f3f5';

    function clearFieldError(key: string) {
        setFieldErrors(prev => {
            if (!(key in prev)) return prev;
            const next = { ...prev }; delete next[key]; return next;
        });
    }

    function set(key: string, v: string) {
        setValues(prev => ({ ...prev, [key]: v }));
        if (error) setError(null);
        clearFieldError(key);
    }

    function fillGenerated(pw: string) {
        const keys = shown.filter(f => f.type === 'password').map(f => f.key);
        setValues(prev => {
            const next = { ...prev };
            for (const k of keys) next[k] = pw;
            return next;
        });
        if (error) setError(null);
        setFieldErrors(prev => {
            const next = { ...prev };
            for (const k of keys) delete next[k];
            return next;
        });
    }

    function fieldError(f: AppAuthField, raw: string): string | null {
        if (!f.optional && !raw.trim()) return t('common.required', 'Required');
        if (!isCreate) return null;
        if (f.type === 'password') {
            if (raw.length < 6)  return t('common.useAtLeast6', 'Use at least 6 characters');
            if (raw.length > 64) return t('common.use64OrFewer', 'Use 64 characters or fewer');
        }
        if (f.key === 'username') {
            const u = raw.trim();
            if (u.length < 3)  return t('common.useAtLeast3', 'Use at least 3 characters');
            if (u.length > 30) return t('common.use30OrFewer', 'Use 30 characters or fewer');
            if (!/^[a-zA-Z0-9_.]+$/.test(u)) return t('common.usernameCharset', 'Letters, numbers, _ and . only');
        }
        return null;
    }

    function serverErrorField(res: { message?: string; field?: string }): string | null {
        const pick = (...keys: string[]) => keys.find(k => shown.some(f => f.key === k)) ?? null;
        if (res.field) { const k = pick(res.field); if (k) return k; }
        if (!isCreate) return null;
        const m = (res.message ?? '').toLowerCase();
        if (/already created|recover the account|wrong username or password/.test(m)) return null;
        if (/password/.test(m))                 { const k = pick('password');         if (k) return k; }
        if (/username|letters, numbers/.test(m)){ const k = pick('username', 'email'); if (k) return k; }
        if (/phone|number/.test(m))             { const k = pick('phone');            if (k) return k; }
        if (/e-?mail|address/.test(m))          { const k = pick('email');            if (k) return k; }
        if (/\bbio\b/.test(m))                  { const k = pick('bio');              if (k) return k; }
        if (/\bname\b/.test(m))                 { const k = pick('name');             if (k) return k; }
        return null;
    }

    async function submit() {
        if (busy) return;
        const errs: Record<string, string> = {};
        for (const f of shown) {
            const e = fieldError(f, values[f.key] ?? '');
            if (e) errs[f.key] = e;
        }
        const firstBad = shown.find(f => errs[f.key]);
        if (firstBad) {
            setFieldErrors(errs);
            setError(null);
            const el = inputs.current[firstBad.key];
            el?.scrollIntoView({ block: 'center' });
            el?.focus();
            return;
        }
        setFieldErrors({});
        setError(null);
        if (onSubmit) {
            setBusy(true);
            const res = await onSubmit(mode, values);
            setBusy(false);
            if (!res.ok) {
                const key = serverErrorField(res);
                if (key) {
                    setFieldErrors({ [key]: res.message ?? t('common.pleaseCheckField', 'Please check this field') });
                    const el = inputs.current[key];
                    el?.scrollIntoView({ block: 'center' });
                    el?.focus();
                } else if (!isCreate) {
                    setFieldErrors(Object.fromEntries(shown.map(f => [f.key, t('common.notValidLogin', 'Not a valid login')])));
                    const pw = shown.find(f => f.type === 'password');
                    if (pw) inputs.current[pw.key]?.focus();
                } else {
                    setError(res.message ?? t('common.somethingWentWrong', 'Something went wrong. Please try again.'));
                }
                return;
            }
        }
        onAuthed(values);
    }

    return (
        <div className="relative flex h-full flex-col text-black" style={{ background: formBg }}>
            <div className="h-[54px] shrink-0" aria-hidden />
            <header className="flex items-center px-3 py-2">
                <button type="button" onClick={onBack} className="flex items-center active:opacity-60" style={{ color: theme.accent }}>
                    <ChevronLeft className="h-[28px] w-[28px]" strokeWidth={2.4} />
                    <span className="-ml-0.5 text-[18px]">{t('common.back', 'Back')}</span>
                </button>
                <div className="flex-1" aria-hidden />
                <div className="w-9" aria-hidden />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
                {icon && (
                    <div
                        className="mx-auto mb-3.5 h-[80px] w-[80px] overflow-hidden rounded-[18px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                        style={{ boxShadow: '0 7px 18px rgba(0,0,0,0.15)' }}
                    >
                        <AppIconSVG icon={icon} />
                    </div>
                )}
                <h2 className="mb-4 text-center text-[20px] font-bold">{title}</h2>

                {(error || notice) && (
                    <div className="mb-3 text-center text-[13px] font-semibold" style={{ color: error ? '#e0245e' : theme.accent }}>
                        {error ?? notice}
                    </div>
                )}

                <div className="overflow-hidden rounded-2xl bg-white">
                    {shown.map((f, i) => (
                        <Field
                            key={f.key}
                            label={f.label}
                            type={f.type}
                            suffix={f.suffix}
                            value={values[f.key] ?? ''}
                            onChange={v => set(f.key, v)}
                            last={i === shown.length - 1}
                            onFocus={() => setFocusedKey(f.key)}
                            onBlur={() => setFocusedKey(prev => (prev === f.key ? null : prev))}
                            required={isCreate && !f.optional}
                            error={fieldErrors[f.key]}
                            inputRef={el => { inputs.current[f.key] = el; }}
                        />
                    ))}
                </div>

                {hasPassword && (
                    <div className="mt-3.5 flex items-start gap-2.5 px-1.5">
                        <ShieldCheck className="mt-0.5 h-[21px] w-[21px] shrink-0" strokeWidth={2.4} style={{ color: theme.accent }} />
                        <p className="text-[16px] font-medium leading-snug text-black/70">
                            {t('common.choosePasswordNote', 'Choose a password just for {appName}. Try not to reuse a real-world password, like the one for your bank, so a leak here can never reach your real accounts.', { appName })}
                        </p>
                    </div>
                )}

                <button
                    type="button"
                    onClick={submit}
                    disabled={busy}
                    className="mt-5 w-full rounded-full py-4 text-[17px] font-bold text-white active:opacity-90 disabled:opacity-60"
                    style={{ background: theme.accent }}
                >
                    {busy ? t('common.pleaseWait', 'Please wait…') : heading}
                </button>

                {!isCreate && savedUsername && onQuickLogin && (
                    <button
                        type="button"
                        onClick={onQuickLogin}
                        disabled={quickBusy}
                        className="mt-4 flex w-full flex-col items-center rounded-2xl bg-white py-3.5 active:opacity-80 disabled:opacity-60"
                    >
                        <span className="flex items-center gap-2 text-[15px] font-semibold text-black/65">
                            <KeyRound className="h-[16px] w-[16px]" strokeWidth={2.4} style={{ color: theme.accent }} />
                            {t('common.savedAccount', 'You have a saved account')}
                        </span>
                        <span className="mt-0.5 text-[17px] font-bold" style={{ color: theme.accent }}>
                            {quickBusy ? t('common.loggingIn', 'Logging in...') : t('common.logInAs', 'Log in as {savedUsername}', { savedUsername })}
                        </span>
                    </button>
                )}

            </div>

            <SuggestionBar
                show={!!fill}
                icon={fill?.icon}
                main={fill?.display ?? ''}
                sub={fill?.sub ?? ''}
                accent={theme.accent}
                onPick={() => {
                    if (!focusedField || !fill) return;
                    if (focusedField.type === 'password') fillGenerated(fill.value);
                    else set(focusedField.key, fill.value);
                }}
            />
        </div>
    );
}

function ResetForm({ phase, appName, icon, theme, identity, onIdentity, myNumber, onRequestReset, onConfirmReset, onSuggestCode, onAdvance, onBack, onDone }: {
    phase:    'reset' | 'resetCode';
    appName:  string;
    icon?:    string;
    theme:    AppAuthTheme;
    identity: string;
    onIdentity: (v: string) => void;
    myNumber?: string | null;
    onRequestReset?: (identity: string) => Promise<{ ok: boolean; message?: string; channel?: 'email' | 'sms' }>;
    onConfirmReset?: (identity: string, code: string, password: string) => Promise<{ ok: boolean; message?: string }>;
    onSuggestCode?: (identity: string) => Promise<{ code?: string; source?: 'mail' | 'messages' }>;
    onAdvance: () => void;
    onBack:   () => void;
    onDone:   () => void;
}) {
    const [code,     setCode]     = useSessionState(`auth:${appName}:resetCode`, '');
    const [password, setPassword] = useSessionState(`auth:${appName}:resetPassword`, '');
    const [confirm,  setConfirm]  = useSessionState(`auth:${appName}:resetConfirm`, '');
    const [error,    setError]    = useState<string | null>(null);
    const [busy,     setBusy]     = useState(false);
    const [sentVia,  setSentVia]  = useSessionState<'email' | 'sms' | null>(`auth:${appName}:resetSentVia`, null);
    const [suggestion, setSuggestion] = useState<{ code?: string; source?: 'mail' | 'messages' } | null>(null);
    const [codeFocused, setCodeFocused] = useState(false);
    const [identityFocused, setIdentityFocused] = useState(false);

    const codeBar = phase === 'resetCode' && codeFocused && !code && !!suggestion?.code;
    const idBar   = phase === 'reset' && identityFocused && !identity && !!myNumber;

    useEffect(() => {
        if (phase !== 'resetCode' || !onSuggestCode) { setSuggestion(null); return; }
        let alive = true;
        void onSuggestCode(identity.trim()).then(s => { if (alive) setSuggestion(s); });
        return () => { alive = false; };
    }, [phase, onSuggestCode, identity]);

    const formBg = theme.formBg ?? '#f2f3f5';

    async function requestCode() {
        if (busy || !onRequestReset) return;
        if (!identity.trim()) { setError(t('common.enterEmailOrPhone', 'Please enter the email or phone number on the account.')); return; }
        setBusy(true);
        const res = await onRequestReset(identity.trim());
        setBusy(false);
        if (!res.ok) { setError(res.message ?? t('common.somethingWentWrong', 'Something went wrong. Please try again.')); return; }
        setError(null);
        setSentVia(res.channel ?? (identity.includes('@') ? 'email' : 'sms'));
        onAdvance();
    }

    async function confirmReset() {
        if (busy || !onConfirmReset) return;
        if (!code.trim()) { setError(t('common.enterTheCode', 'Please enter the code.')); return; }
        if (password.length < 6) { setError(t('common.passwordMin6', 'Password must be at least 6 characters.')); return; }
        if (password !== confirm) { setError(t('common.passwordsNoMatch', 'Passwords do not match.')); return; }
        setBusy(true);
        const res = await onConfirmReset(identity.trim(), code.trim(), password);
        setBusy(false);
        if (!res.ok) { setError(res.message ?? t('common.somethingWentWrong', 'Something went wrong. Please try again.')); return; }
        setCode(''); setPassword(''); setConfirm(''); setSentVia(null);
        onDone();
    }

    const sentNote = sentVia === 'email'
        ? t('common.codeSentMail', 'Code sent. Check your Mail inbox.')
        : t('common.codeSentTexts', 'Code sent. Check your texts.');

    return (
        <div className="relative flex h-full flex-col text-black" style={{ background: formBg }}>
            <div className="h-[54px] shrink-0" aria-hidden />
            <header className="flex items-center px-3 py-2">
                <button type="button" onClick={() => { setError(null); onBack(); }} className="flex items-center active:opacity-60" style={{ color: theme.accent }}>
                    <ChevronLeft className="h-[28px] w-[28px]" strokeWidth={2.4} />
                    <span className="-ml-0.5 text-[18px]">{t('common.back', 'Back')}</span>
                </button>
                <div className="flex-1" aria-hidden />
                <div className="w-9" aria-hidden />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
                {icon && (
                    <div
                        className="mx-auto mb-3.5 h-[68px] w-[68px] overflow-hidden rounded-[16px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                        style={{ boxShadow: '0 6px 16px rgba(0,0,0,0.14)' }}
                    >
                        <AppIconSVG icon={icon} />
                    </div>
                )}
                <h2 className="mb-4 text-center text-[20px] font-bold">{t('common.resetYourPassword', 'Reset your password')}</h2>

                {phase === 'reset' ? (
                    <>
                        <div className="overflow-hidden rounded-2xl bg-white">
                            <Field
                                label={t('common.emailOrPhone', 'Email or phone number')}
                                type="tel"
                                value={identity}
                                onChange={v => { onIdentity(v); if (error) setError(null); }}
                                last
                                onFocus={() => setIdentityFocused(true)}
                                onBlur={() => setIdentityFocused(false)}
                            />
                        </div>

                        <p className="mt-3 px-2 text-[15px] leading-snug text-black/60">
                            {t('common.resetHelp', 'Enter the email or phone number linked to your account and we will text or email you a code.')}
                        </p>

                        {error && <div className="mt-3 text-[13px]" style={{ color: '#e0245e' }}>{error}</div>}

                        <button
                            type="button"
                            onClick={() => void requestCode()}
                            disabled={busy}
                            className="mt-5 w-full rounded-full py-4 text-[17px] font-bold text-white active:opacity-90 disabled:opacity-60"
                            style={{ background: theme.accent }}
                        >
                            {busy ? t('common.pleaseWait', 'Please wait…') : t('common.sendCode', 'Send code')}
                        </button>
                    </>
                ) : (
                    <>
                        {sentVia && (
                            <div className="mb-3 text-center text-[13px] font-semibold" style={{ color: theme.accent }}>
                                {sentNote}
                            </div>
                        )}

                        <div className="overflow-hidden rounded-2xl bg-white">
                            <Field
                                label={t('common.code', 'Code')}
                                type="number"
                                value={code}
                                onChange={v => { setCode(v); if (error) setError(null); }}
                                onFocus={() => setCodeFocused(true)}
                                onBlur={() => setCodeFocused(false)}
                            />
                            <Field
                                label={t('common.newPassword', 'New password')}
                                type="password"
                                value={password}
                                onChange={v => { setPassword(v); if (error) setError(null); }}
                            />
                            <Field
                                label={t('common.confirmPassword', 'Confirm password')}
                                type="password"
                                value={confirm}
                                onChange={v => { setConfirm(v); if (error) setError(null); }}
                                last
                            />
                        </div>

                        {error && <div className="mt-3 text-[13px]" style={{ color: '#e0245e' }}>{error}</div>}

                        <button
                            type="button"
                            onClick={() => void confirmReset()}
                            disabled={busy}
                            className="mt-5 w-full rounded-full py-4 text-[17px] font-bold text-white active:opacity-90 disabled:opacity-60"
                            style={{ background: theme.accent }}
                        >
                            {busy ? t('common.pleaseWait', 'Please wait…') : t('common.resetAppPassword', 'Reset {appName} password', { appName })}
                        </button>
                    </>
                )}
            </div>

            <SuggestionBar
                show={codeBar || idBar}
                icon={codeBar
                    ? <KeyRound className="h-[20px] w-[20px]" strokeWidth={2.2} />
                    : <Phone className="h-[20px] w-[20px]" strokeWidth={2.2} />}
                main={codeBar ? (suggestion?.code ?? '') : (myNumber ? formatPhone(myNumber) : '')}
                sub={codeBar
                    ? (suggestion?.source === 'mail' ? t('common.fromMail', 'From Mail') : t('common.fromMessages', 'From Messages'))
                    : t('common.fromYourPhoneNumber', 'From your phone number')}
                accent={theme.accent}
                onPick={() => {
                    if (codeBar && suggestion?.code) setCode(suggestion.code);
                    else if (myNumber) onIdentity(myNumber);
                }}
            />
        </div>
    );
}

export function ChangePasswordForm({ appName, icon, theme, identity, savedPassword, onSubmit, onBack }: {
    appName:   string;
    icon?:     string;
    theme:     AppAuthTheme;
    identity?: string;
    savedPassword?: string | null;
    onSubmit:  (current: string, next: string) => Promise<string | null>;
    onBack:    () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const [current, setCurrent] = useState('');
    const [next,    setNext]    = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy,    setBusy]    = useState(false);
    const [fieldErrors, setFieldErrors] = useState<{ current?: string; new?: string; confirm?: string }>({});
    const [focused,     setFocused]     = useState<'current' | 'new' | 'confirm' | null>(null);
    const [suggestedPw, setSuggestedPw] = useState<string | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const formBg = theme.formBg ?? '#f2f3f5';

    useStatusBarLight(false);

    const focusingNewPw = focused === 'new' || focused === 'confirm';
    useEffect(() => {
        if (focusingNewPw) setSuggestedPw(generateStrongPassword());
    }, [focused]);

    function clearErr(...keys: ('current' | 'new' | 'confirm')[]) {
        setFieldErrors(prev => {
            let changed = false;
            const next = { ...prev };
            for (const k of keys) if (next[k]) { delete next[k]; changed = true; }
            return changed ? next : prev;
        });
    }

    function fillNewPair(pw: string) {
        setNext(pw);
        setConfirm(pw);
        clearErr('new', 'confirm');
    }

    function submit() {
        if (busy) return;
        const errs: { current?: string; new?: string; confirm?: string } = {};
        if (!current)                                        errs.current = t('common.required', 'Required');
        else if (savedPassword && current !== savedPassword) errs.current = t('common.incorrect', 'Incorrect');
        if (next.length < 6)                      errs.new = t('common.useAtLeast6', 'Use at least 6 characters');
        else if (next === current)                errs.new = t('common.mustBeDifferent', 'Must be different');
        if (next.length >= 6 && confirm !== next) errs.confirm = t('common.doesNotMatch', 'Does not match');
        if (errs.current || errs.new || errs.confirm) { setFieldErrors(errs); return; }
        setFieldErrors({});
        setConfirmOpen(true);
    }

    async function applyChange() {
        setBusy(true);
        const err = await onSubmit(current, next);
        setBusy(false);
        if (err) { setFieldErrors({ current: err }); return; }
        goBack();
    }

    let fill: { main: string; sub: string; onPick: () => void } | null = null;
    if (focused === 'current' && !current && savedPassword) {
        fill = {
            main: t('common.useSavedPassword', 'Use saved password'),
            sub:  t('common.fromYourPasswordsApp', 'From your Passwords app'),
            onPick: () => { setCurrent(savedPassword); clearErr('current'); },
        };
    } else if (focusingNewPw && suggestedPw && (focused === 'new' ? !next : !confirm)) {
        fill = {
            main: t('common.useStrongPassword', 'Use a strong password'),
            sub:  t('common.createdFor', 'Created for {appName}', { appName }),
            onPick: () => fillNewPair(suggestedPw),
        };
    }

    return (
        <div className="absolute inset-0 z-40 flex flex-col text-black" style={{ background: formBg, ...pageStyle }}>
            <div className="h-[54px] shrink-0" aria-hidden />
            <header className="flex items-center px-3 py-2">
                <button type="button" onClick={goBack} className="flex items-center active:opacity-60" style={{ color: theme.accent }}>
                    <ChevronLeft className="h-[28px] w-[28px]" strokeWidth={2.4} />
                    <span className="-ml-0.5 text-[18px]">{t('common.back', 'Back')}</span>
                </button>
                <div className="flex-1" aria-hidden />
                <div className="w-9" aria-hidden />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
                {icon && (
                    <div
                        className="mx-auto mb-3.5 h-[68px] w-[68px] overflow-hidden rounded-[16px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                        style={{ boxShadow: '0 6px 16px rgba(0,0,0,0.14)' }}
                    >
                        <AppIconSVG icon={icon} />
                    </div>
                )}
                <h2 className="text-center text-[20px] font-bold">{t('common.changeYourPassword', 'Change your password')}</h2>
                {identity
                    ? <p className="mb-4 mt-1 text-center text-[14px] font-medium text-black/50">{identity}</p>
                    : <div className="mb-4" aria-hidden />}

                <div className="overflow-hidden rounded-2xl bg-white">
                    <Field label={t('common.currentPassword', 'Current password')} type="password" value={current} error={fieldErrors.current} onChange={v => { setCurrent(v); clearErr('current'); }} onFocus={() => setFocused('current')} onBlur={() => setFocused(f => f === 'current' ? null : f)} />
                    <Field label={t('common.newPassword', 'New password')}     type="password" value={next}    error={fieldErrors.new}     onChange={v => { setNext(v); clearErr('new', 'confirm'); }} onFocus={() => setFocused('new')} onBlur={() => setFocused(f => f === 'new' ? null : f)} />
                    <Field label={t('common.confirmPassword', 'Confirm password')} type="password" value={confirm} error={fieldErrors.confirm} onChange={v => { setConfirm(v); clearErr('confirm'); }} onFocus={() => setFocused('confirm')} onBlur={() => setFocused(f => f === 'confirm' ? null : f)} last />
                </div>

                <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={busy}
                    className="mt-5 w-full rounded-full py-4 text-[17px] font-bold text-white active:opacity-90 disabled:opacity-60"
                    style={{ background: theme.accent }}
                >
                    {busy ? t('common.pleaseWait', 'Please wait…') : t('common.changeAppPassword', 'Change {appName} password', { appName })}
                </button>

                <p className="mt-3 px-2 text-[15px] leading-snug text-black/60">
                    {t('common.alsoUpdatesSaved', 'Also updates the password saved in your Passwords app.')}
                </p>
            </div>

            <SuggestionBar
                show={!!fill}
                icon={<KeyRound className="h-[20px] w-[20px]" strokeWidth={2.2} />}
                main={fill?.main ?? ''}
                sub={fill?.sub ?? ''}
                accent={theme.accent}
                onPick={() => fill?.onPick()}
            />

            {confirmOpen && (
                <AlertDialog
                    title={t('common.changeAppPasswordQ', 'Change {appName} password?', { appName })}
                    message={t('common.changePasswordConfirm', 'This also updates your saved {appName} password in the Passwords app.', { appName })}
                    confirmLabel={t('common.change', 'Change')}
                    cancelLabel={t('common.cancel', 'Cancel')}
                    onCancel={() => setConfirmOpen(false)}
                    onConfirm={() => { setConfirmOpen(false); void applyChange(); }}
                />
            )}
        </div>
    );
}

function Field({ label, value, onChange, type, last, suffix, onFocus, onBlur, required, error, inputRef }: {
    label:    string;
    value:    string;
    onChange: (v: string) => void;
    type?:    string;
    last?:    boolean;
    suffix?:  string;
    onFocus?: () => void;
    onBlur?:  () => void;
    required?: boolean;
    error?: string;
    inputRef?: (el: HTMLInputElement | null) => void;
}) {
    const isPassword = type === 'password';
    const [revealed, setRevealed] = useState(false);

    // 'number' renders as text+numeric so e/E/+/-/. can't be typed like in a native number input.
    const isNumber = type === 'number';
    const inputType = suffix || isNumber ? 'text' : isPassword ? (revealed ? 'text' : 'password') : (type ?? 'text');
    const bad = !!error;

    return (
        <div
            className={`relative px-4 py-3.5 ${last ? '' : 'border-b border-black/[0.07]'}`}
            style={bad ? { background: 'rgba(224,36,94,0.06)' } : undefined}
        >
            <div className="flex items-baseline justify-between gap-2">
                <span className={`shrink-0 text-[15px] font-medium ${bad ? 'text-[#e0245e]' : 'text-[#46525C]'}`}>
                    {label}
                    {required && <span className="text-[#e0245e]" aria-hidden> *</span>}
                </span>
                {error && <span className="text-right text-[13px] font-semibold leading-tight text-[#e0245e]">{error}</span>}
            </div>
            <div className="flex items-baseline">
                <input
                    ref={inputRef}
                    type={inputType}
                    inputMode={type === 'number' ? 'numeric' : type === 'tel' ? 'tel' : undefined}
                    value={value}
                    onChange={e => onChange(
                        isNumber ? e.target.value.replace(/\D/g, '')
                        : suffix ? e.target.value.replace(/@.*$/, '')
                        : e.target.value,
                    )}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    aria-required={required || undefined}
                    aria-invalid={bad ? true : undefined}
                    className="min-w-0 flex-1 bg-transparent pt-1 text-[17px] text-black outline-none"
                />
                {suffix && <span className="shrink-0 pl-0.5 text-[16px] font-medium text-black/40">{suffix}</span>}
                {isPassword && (
                    <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setRevealed(r => !r)}
                        aria-label={revealed ? t('common.hidePassword', 'Hide password') : t('common.showPassword', 'Show password')}
                        className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full bg-black/[0.06] active:opacity-70"
                    >
                        {revealed
                            ? <EyeOff className="h-[18px] w-[18px] text-black/45" strokeWidth={2.1} />
                            : <Eye className="h-[18px] w-[18px] text-black/45" strokeWidth={2.1} />}
                    </button>
                )}
            </div>
        </div>
    );
}

function SuggestionBar({ show, icon, main, sub, accent, onPick }: {
    show: boolean;
    icon: React.ReactNode;
    main: string;
    sub:  string;
    accent: string;
    onPick: () => void;
}) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { if (show) setMounted(true); }, [show]);

    const last = useRef({ icon, main, sub });
    if (show) last.current = { icon, main, sub };
    const c = show ? { icon, main, sub } : last.current;

    if (!mounted) return null;
    return (
        <div
            className="absolute inset-x-4 bottom-9 z-20"
            style={{ animation: show ? 'appauth-card-in 0.3s cubic-bezier(0.2,1.2,0.4,1)' : 'appauth-card-out 0.22s ease-in forwards' }}
            onAnimationEnd={() => { if (!show) setMounted(false); }}
        >
            <style>{`
                @keyframes appauth-card-in  { from { transform: translateY(18px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes appauth-card-out { from { transform: translateY(0); opacity: 1; } to { transform: translateY(18px); opacity: 0; } }
            `}</style>
            <div
                className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3.5"
                style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.20), 0 2px 8px rgba(0,0,0,0.10)' }}
            >
                <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                    style={{ color: accent, backgroundColor: `${accent}1a` }}
                >
                    {c.icon}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[18px] font-bold text-black">{c.main}</span>
                    <span className="block text-[14.5px] font-medium text-black/55">{c.sub}</span>
                </span>
                <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={onPick}
                    className="shrink-0 rounded-full px-4 py-2 text-[16px] font-bold active:opacity-70"
                    style={{ color: accent, backgroundColor: `${accent}1a` }}
                >
                    {t('common.fill', 'Fill')}
                </button>
            </div>
        </div>
    );
}
