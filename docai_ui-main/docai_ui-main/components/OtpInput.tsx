import React, { useRef, useEffect, useMemo } from 'react';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
}

const OtpInput: React.FC<OtpInputProps> = ({ value, onChange, length = 6 }) => {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  
  const valueItems = useMemo(() => {
    const valueArray = value.split('');
    const items: string[] = [];
    for (let i = 0; i < length; i++) {
        items.push(valueArray[i] || '');
    }
    return items;
  }, [value, length]);

  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const targetValue = e.target.value;
    const newOtp = [...valueItems];
    newOtp[index] = targetValue.slice(-1);
    const finalOtp = newOtp.join('');
    onChange(finalOtp);

    // Focus next input if current one is filled
    if (targetValue && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !valueItems[index] && index > 0) {
      // Focus previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    }
  };
  
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData
        .getData('text')
        .trim()
        .slice(0, length);
    if (pastedData) {
        onChange(pastedData);
    }
  };

  return (
    <div className="otp-input-container" onPaste={handlePaste}>
      {valueItems.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { inputRefs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          className="otp-input-box"
          value={digit}
          onChange={(e) => handleChange(e, index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          aria-label={`OTP Digit ${index + 1}`}
        />
      ))}
    </div>
  );
};

export default OtpInput;