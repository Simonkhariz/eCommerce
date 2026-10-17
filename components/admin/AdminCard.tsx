import React from 'react';

interface AdminCardProps extends React.HTMLAttributes<HTMLElement> {
  patternStyle?: React.CSSProperties;
  children: React.ReactNode;
}

export const AdminCard: React.FC<AdminCardProps> = ({
  className = '',
  patternStyle,
  children,
  ...props
}) => {
  return (
    <section
      className={`relative flex flex-col items-start overflow-clip rounded-xl bg-[#f6f6f6] p-1 shadow-[inset_0_0_0_0.8px_#e5e7eb] ${className}`}
      {...props}
    >
      <img
        src="/admin/card-pattern.svg"
        alt=""
        width={1639}
        height={560}
        className="pointer-events-none absolute block h-[560px] w-[1639px] max-w-none select-none"
        style={patternStyle}
      />
      {children}
    </section>
  );
};

export const AdminCardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`relative flex w-full shrink-0 items-center justify-between p-2 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const AdminCardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <h2
      className={`whitespace-nowrap text-sm font-medium leading-none text-[#4b5563] ${className}`}
      {...props}
    >
      {children}
    </h2>
  );
};
