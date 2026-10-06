import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type BookingWidgetProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  business: string;
  service?: string;
  color?: string;
};

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'slotwise-booking': BookingWidgetProps;
    }
  }
}
