import { Field } from '@/components/ui';

export function ReleaseDateTimeField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minimumDate?: Date;
  hint?: string;
  mode?: 'date' | 'datetime';
  optional?: boolean;
}) {
  return <Field label={label} value={value} onChangeText={onChange} hint={hint} />;
}
