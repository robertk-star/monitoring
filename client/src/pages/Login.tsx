import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useLocalAuth } from "@/contexts/LocalAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type ApiResponse<T = Record<string, unknown>> = T & {
  status?: string;
  message?: string;
  success?: boolean;
  hasAdmin?: boolean;
  mustChangePassword?: boolean;
};

async function apiPost<T>(url: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data: ApiResponse<T>;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server returned a non-JSON response: ${text.slice(0, 180)}`);
  }

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

async function apiGet<T>(url: string): Promise<ApiResponse<T>> {
  const response = await fetch(url, { credentials: "include" });
  const text = await response.text();
  let data: ApiResponse<T>;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server returned a non-JSON response: ${text.slice(0, 180)}`);
  }

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

function startDriverPipelineLoginSync() {
  void fetch("/api/driverpipeline-login-sync", {
    method: "POST",
    credentials: "include",
  }).catch(() => {});
}

export default function Login() {
  const [, navigate] = useLocation();
  const { refetch } = useLocalAuth();

  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSetup() {
      try {
        const data = await apiGet<{ hasAdmin: boolean }>("/api/auth/setup-status");
        if (!cancelled) setHasAdmin(Boolean(data.hasAdmin));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not check setup status";
        toast.error(message);
        if (!cancelled) setHasAdmin(true);
      } finally {
        if (!cancelled) setIsCheckingSetup(false);
      }
    }

    checkSetup();
    return () => {
      cancelled = true;
    };
  }, []);

  const isFirstRun = hasAdmin === false;

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) return;

    setIsSubmitting(true);
    try {
      const data = await apiPost("/api/auth/login", {
        username: username.trim(),
        password,
        rememberMe,
      });
      startDriverPipelineLoginSync();
      refetch();
      toast.success("Signed in");
      navigate(data.mustChangePassword ? "/change-password" : "/select-company");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetup = async (event: FormEvent) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiPost("/api/auth/setup-admin", {
        username: username.trim(),
        password,
      });
      refetch();
      toast.success("Admin account created");
      navigate("/select-company");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Setup failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663368468239/3wvjutsFdcEUnRywyqJHNV/SaffhireLogoShirtStyle_0449b2e9.webp"
            alt="SaffHire Background Screening"
            className="h-20 object-contain"
          />
        </div>

        <Card className="shadow-lg border-0">
          <CardHeader className="pb-4 text-center">
            {isFirstRun ? (
              <>
                <div className="flex justify-center mb-2">
                  <ShieldCheck className="w-8 h-8" style={{ color: "#1FFF00" }} />
                </div>
                <h1 className="text-xl font-bold text-gray-900">First-Time Setup</h1>
                <p className="text-sm text-gray-500 mt-1">Create your admin account to get started</p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold text-gray-900">Sign In</h1>
                <p className="text-sm text-gray-500 mt-1">Enter your username and password</p>
              </>
            )}
          </CardHeader>

          <CardContent>
            <form onSubmit={isFirstRun ? handleSetup : handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder={isFirstRun ? "Choose a username" : "Enter your username"}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  minLength={3}
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={isFirstRun ? "Min. 6 characters" : "Enter your password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={isFirstRun ? 6 : undefined}
                    autoComplete={isFirstRun ? "new-password" : "current-password"}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isFirstRun ? (
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember-me"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                  />
                  <label htmlFor="remember-me" className="text-sm text-gray-600 cursor-pointer select-none">
                    Remember me for 30 days
                  </label>
                </div>
              )}

              <Button
                type="submit"
                className="w-full font-semibold mt-2"
                style={{ backgroundColor: "#1FFF00", color: "#0F172A" }}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isFirstRun ? "Creating Account..." : "Signing In..."}
                  </>
                ) : isFirstRun ? (
                  "Create Admin Account"
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          SaffHire Background Screening &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
