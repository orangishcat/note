import React, {useContext, useEffect, useState} from "react"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle} from "@/components/ui/modal"
import {Lock, Mail, User} from "lucide-react"
import HCaptcha from "@hcaptcha/react-hcaptcha"
import {AccountContext, AccountView} from "@/app/providers";
import {AxiosError, AxiosResponse} from "axios";
import api from "@/lib/network";

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSwitch: () => void
  type: "login" | "signup"
}

export function AuthModal({isOpen, onClose, onSwitch, type}: AuthModalProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [verifyPass, setVerifyPass] = useState("")
  const [username, setUsername] = useState("")
  const [isValidUsername, setIsValidUsername] = useState(false)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const [isValidEmail, setIsValidEmail] = useState(false)
  const [isValidPassword, setIsValidPassword] = useState(false)
  const [showCaptcha, setShowCaptcha] = useState(false);

  const context = useContext(AccountContext);

  const [isValidForm, setIsValidForm] = useState(false);
  useEffect(() => setIsValidForm(isValidEmail && isValidPassword && (type === "login" || isValidUsername)), [isValidEmail, isValidPassword, isValidUsername, type])

  const validateUsername = (username: string) => {
    const re = /^[a-zA-Z0-9._-]+$/
    const valid = type === "login" || (username.length > 0 && username.length <= 65 && re.test(username))
    setUsername(username)
    setIsValidUsername(valid)
    setError(valid ? "" : "Username can only contain letters, numbers, dots, underscores, and dashes.")
    return valid;
  }

  const validateEmail = (email: string) => {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    const valid = re.test(email)
    setEmail(email)
    setIsValidEmail(valid)
    if (type === "signup") setError(valid ? "" : "Invalid email address")
    return valid;
  }

  const checkMatch = (verifyPass: string) => {
    setVerifyPass(verifyPass)
    if (password !== verifyPass && type === "signup" && verifyPass.length > 0)
      setError("Passwords do not match")
    else
      setError("")
  }

  const validPassword = (password: string) => {
    const valid = type === 'login' || (password.length >= 8 && password.length <= 256);
    setPassword(password);
    setIsValidPassword(valid)
    setError(valid ? "" : "Password must be between 8 and 256 characters long");
    return valid;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (type === "signup" && password !== verifyPass) {
      setError("Passwords do not match")
      return
    }
    setShowCaptcha(true);
  }

  const handleCaptcha = async () => {
    if (context?.account) return;
    try {
      setStatus(type === "login" ? "Logging in..." : "Loading...");
      api.post<AccountView>("/account/login", {
        email: email,
        password: password
      }).then((resp: AxiosResponse<AccountView>) => {
        if (!context) throw new Error("Auth failed: Account not found.");
        context.setAccount(resp.data);
        // Set justLogin to true to trigger file manager refresh
        context.setJustLogin(true);
        // Reset justLogin after a short delay
        setTimeout(() => {
          if (context) context.setJustLogin(false);
        }, 1000);
        onClose();
      }).catch((error: AxiosError) => {
        console.error("Authentication failed:", error);
        setError("Authentication failed. Please try again.");
      });
    } catch (error) {
      setError("Authentication failed. Please try again.");
    }
  };

  return (
    <Modal open={isOpen} onOpenChange={onClose}>
      <ModalContent>
        <ModalHeader className="border-b border-gray-200 dark:border-gray-700 pb-4">
          <ModalTitle className="font-bold">{type === "login" ? "Log In" : "Sign Up"}</ModalTitle>
          <ModalDescription/>
        </ModalHeader>

        {showCaptcha ?
          <div className="mb-4 flex flex-col gap-2 w-full place-items-center justify-center">
            <HCaptcha sitekey="10000000-ffff-ffff-ffff-000000000001"
                      onVerify={() => handleCaptcha()}/><br/>
            {error && <p className="text-red-500 text-center text-sm">{error}</p>}
            {status && <p className="text-gray-500 text-center dark:text-gray-400">{status}</p>}
          </div> :
          <>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 my-4">
                {type === "signup" ? <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                        size={18}/>
                  <Input
                    autoComplete="off"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => validateUsername(e.target.value)}
                    required
                    className="w-full p-5 pl-10 dark:bg-gray-900"/>
                </div> : ""}
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                        size={18}/>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => validateEmail(e.target.value)}
                    required
                    className="w-full p-5 pl-10 dark:bg-gray-900"/>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                        size={18}/>
                  <Input
                    type="password"
                    autoComplete={type === "login" ? "current-password" : "new-password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => validPassword(e.target.value)}
                    required
                    className="w-full p-5 pl-10 dark:bg-gray-900"/>
                </div>
                {type === "signup" ? <>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                          size={18}/>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="Confirm password"
                      value={verifyPass}
                      onChange={(e) => checkMatch(e.target.value)}
                      required
                      className="w-full p-5 pl-10 dark:bg-gray-900"/>
                  </div>
                </> : ""}
                {error && <p className="text-red-500 text-center text-sm">{error}</p>}
                {status && <p className="text-gray-500 text-center dark:text-gray-400">{status}</p>}
              </div>
              <ModalFooter className="border-t border-gray-200 dark:border-gray-700 pt-8">
                <Button
                  className="w-full bg-primary hover:bg-accent-400 dark:hover:bg-accent-700 text-black dark:text-white py-5"
                  type="submit"
                  disabled={!isValidForm}
                >
                  {type === "login" ? "Log In" : "Sign Up"}
                </Button>
              </ModalFooter>
            </form>
            <div className="px-6 text-center text-sm">
              {type === "login" ? "Don't have an account? " : "Already have an account? "}
              <Button variant="link" size="link" onClick={() => {
                onSwitch()
                setError("")
              }}>
                {type === "login" ? "Sign Up" : "Log In"}
              </Button>
            </div>
          </>
        }
      </ModalContent>
    </Modal>
  )
}
