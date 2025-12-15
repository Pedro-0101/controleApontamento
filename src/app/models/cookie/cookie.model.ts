export class CookieModel {
  name: string;
  value: string;
  expires: string;

  constructor(name: string, value: string, expires: string) {
    this.name = name;
    this.value = value;
    this.expires = expires;
  }

  validateCookie() {
    const date = new Date();
    if (this.expires < date.toUTCString()) {
      return false;
    }
    return true;
  }
}
