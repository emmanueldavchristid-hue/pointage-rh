import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputBase } from './input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(inputBase, 'h-auto min-h-[80px] py-2 leading-relaxed', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';
