// Names are supplied by the student; confirming email verifies mailbox access only.
export function schoolSignupDetails(email, first, last) {
  email = String(email || '').trim().toLowerCase();
  first = String(first || '').trim().replace(/\s+/gu, ' ');
  last = String(last || '').trim().replace(/\s+/gu, ' ');
  if (!/^30[a-z]{2,}[0-9]*@tesdk12\.net$/.test(email)) throw new Error('Use your school email starting with 30 and ending with @tesdk12.net, like 30yua@tesdk12.net.');
  const valid = name => /^[\p{L}\p{M}][\p{L}\p{M} .’'\-]*$/u.test(name);
  if (!valid(first) || !valid(last)) throw new Error('Enter your first and last names using letters, spaces, apostrophes or hyphens.');
  if (first.length > 20 || last.length > 30 || (first + ' ' + last).length > 32) throw new Error('Use at most 20 characters for your first name and 32 characters for your full name.');
  return {email, metadata: {first_name:first,last_name:last,given_name:first,family_name:last,full_name:first+' '+last,name_source:'self_reported'}};
}
export async function requireEmailConfirmation(url, key, request = fetch) {
  const response = await request(url + '/auth/v1/settings', {headers:{apikey:key}});
  if (!response.ok) throw new Error('Could not check email verification. Please try again.');
  const settings = await response.json();
  if (settings.mailer_autoconfirm !== false) throw new Error('School-email signup is waiting for the site owner to enable Confirm email in Supabase Authentication → Email. Please try again once it is enabled.');
}
