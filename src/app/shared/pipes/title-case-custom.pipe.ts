import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'titleCaseCustom',
  standalone: true
})
export class TitleCaseCustomPipe implements PipeTransform {

  transform(value: string | undefined | null): string {
    if (!value) return '';

    // Split the string into words
    const words = value.toString().toLowerCase().split(' ');

    // Words to keep lowercase (Portuguese prepositions)
    // "e" is also common (e.g. Silva e Souza)
    const exceptions = ['da', 'de', 'do', 'das', 'dos', 'e'];

    // Capitalize the first letter of each word, unless it's an exception
    const titleCasedWords = words.map((word, index) => {
      // Always capitalize the first word
      if (index === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }

      // Keep exceptions lowercase
      if (exceptions.includes(word)) {
        return word;
      }

      // Capitalize other words
      return word.charAt(0).toUpperCase() + word.slice(1);
    });

    return titleCasedWords.join(' ');
  }

}
