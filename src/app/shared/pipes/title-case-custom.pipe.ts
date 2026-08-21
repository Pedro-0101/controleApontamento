import { Pipe, PipeTransform } from '@angular/core';

export function toTitleCase(value: string | undefined | null): string {
  if (!value) return '';

  const words = value.toString().toLowerCase().split(' ');

  const exceptions = ['da', 'de', 'do', 'das', 'dos', 'e'];

  const titleCasedWords = words.map((word, index) => {
    if (index === 0) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }

    if (exceptions.includes(word)) {
      return word;
    }

    return word.charAt(0).toUpperCase() + word.slice(1);
  });

  return titleCasedWords.join(' ');
}

@Pipe({
  name: 'titleCaseCustom',
  standalone: true
})
export class TitleCaseCustomPipe implements PipeTransform {

  transform(value: string | undefined | null): string {
    return toTitleCase(value);
  }

}
