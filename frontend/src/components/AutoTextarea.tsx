import React, { useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

type AutoTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
  maxHeight?: number;
  onSelect?: React.ReactEventHandler<HTMLTextAreaElement>;
  onKeyUp?: React.ReactEventHandler<HTMLTextAreaElement>;
  onClick?: React.ReactEventHandler<HTMLTextAreaElement>;
  onBlur?: React.ReactEventHandler<HTMLTextAreaElement>;
};

export const AutoTextarea = forwardRef<HTMLTextAreaElement, AutoTextareaProps>(function AutoTextarea(
  {
    value,
    onChange,
    placeholder,
    className = '',
    minRows = 2,
    maxHeight = 480,
    onSelect,
    onKeyUp,
    onClick,
    onBlur,
  },
  forwardedRef,
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => innerRef.current!);

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${Math.max(next, minRows * 24)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [maxHeight, minRows]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <textarea
      ref={innerRef}
      value={value}
      rows={minRows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onSelect={onSelect}
      onKeyUp={onKeyUp}
      onClick={onClick}
      onBlur={onBlur}
      onFocus={(e) => {
        resize();
        window.setTimeout(() => {
          e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 300);
      }}
      onInput={resize}
      className={`w-full border-0 bg-transparent outline-none resize-none leading-relaxed placeholder:text-slate-300 text-[16px] ${className}`}
    />
  );
});

export default AutoTextarea;
