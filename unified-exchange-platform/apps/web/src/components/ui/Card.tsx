import { HTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'default' | 'gradient' | 'glass';
  hover?: boolean;
}

export const Card = ({
  children,
  variant = 'default',
  hover = false,
  className = '',
  ...props
}: CardProps) => {
  const variants = {
    default:
      'bg-gray-800/80 border border-gray-700/50 backdrop-blur-sm',
    gradient:
      'bg-gradient-to-br from-gray-800/90 to-gray-900/90 border border-gray-700/50 backdrop-blur-sm',
    glass:
      'bg-white/5 border border-white/10 backdrop-blur-xl',
  };

  const hoverStyles = hover
    ? 'hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/10'
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={hover ? { y: -4 } : {}}
      className={`rounded-xl p-6 shadow-lg ${variants[variant]} ${hoverStyles} ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
};

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export const CardHeader = ({ children, className = '' }: CardHeaderProps) => (
  <div className={`mb-4 ${className}`}>{children}</div>
);

interface CardTitleProps {
  children: ReactNode;
  className?: string;
}

export const CardTitle = ({ children, className = '' }: CardTitleProps) => (
  <h3 className={`text-xl font-bold text-white ${className}`}>{children}</h3>
);

interface CardDescriptionProps {
  children: ReactNode;
  className?: string;
}

export const CardDescription = ({
  children,
  className = '',
}: CardDescriptionProps) => (
  <p className={`text-sm text-gray-400 mt-1 ${className}`}>{children}</p>
);

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export const CardContent = ({ children, className = '' }: CardContentProps) => (
  <div className={className}>{children}</div>
);
