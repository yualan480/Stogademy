// School addresses encode the surname followed by the first initial.
export function schoolSignupDetails(email) {
  email = String(email || '').trim().toLowerCase();
  const match = /^30([a-z]+)([a-z])[0-9]*@tesdk12\.net$/.exec(email);
  if (!match) throw new Error('Use your school email starting with 30 and ending with @tesdk12.net, like 30yua@tesdk12.net.');
  const first = match[2].toUpperCase(), last = match[1][0].toUpperCase() + match[1].slice(1);
  if (last.length > 30) throw new Error('The name in this school email is too long. Please contact the site owner.');
  return {email, metadata: {first_name:first,last_name:last,given_name:first,family_name:last,full_name:first+' '+last,name_source:'school_email'}};
}
export async function requireEmailConfirmation(url, key, request = fetch) {
  const response = await request(url + '/auth/v1/settings', {headers:{apikey:key}});
  if (!response.ok) throw new Error('Could not check email verification. Please try again.');
  const settings = await response.json();
  if (settings.mailer_autoconfirm !== false) throw new Error('School-email signup is waiting for the site owner to enable Confirm email in Supabase Authentication → Email. Please try again once it is enabled.');
}
