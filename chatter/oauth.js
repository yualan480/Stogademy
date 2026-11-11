// OAuth must navigate the top page: Google sign-in cannot run inside an iframe.
export async function startGoogleSignIn(sb,origin,navigate){
 const {data,error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:new URL('/',origin).href,skipBrowserRedirect:true,queryParams:{prompt:'select_account',hd:'tesdk12.net'}}});
 if(error)throw error;
 if(!data?.url||new URL(data.url).protocol!=='https:')throw Error('Google sign-in is unavailable. Please try again.');
 navigate(data.url);
}
