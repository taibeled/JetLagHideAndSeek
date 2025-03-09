import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Get the base URL for assets
export function getBaseUrl() {
  return import.meta.env.BASE_URL || '/';
}
