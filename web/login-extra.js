const createAccount=document.createElement('a');
createAccount.className='btn create-account';
createAccount.textContent='Create a Couch Club account ↗';
createAccount.href=document.querySelector('#signIn').href+'&intent=create';
createAccount.target='_top';
createAccount.style.cssText='background:transparent;color:#c9a7ff;border:1px solid #6d5591;margin-top:6px';
document.querySelector('#signIn').insertAdjacentElement('afterend',createAccount);
