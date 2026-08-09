        (() => {
            const list = document.getElementById('membersList');
            if (!list) return;

            function initials(name) {
                const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
                return (parts[0]?.charAt(0) || 'T').toUpperCase();
            }

            function movePrimaryAction() {
                const button = document.getElementById('addMemberButton');
                const controls = document.querySelector('.members-toolbar-controls');
                if (button && controls && button.parentElement !== controls) controls.append(button);
            }

            function enhanceMemberIdentity() {
                list.querySelectorAll('.members-table tbody tr').forEach((row) => {
                    const cell = row.cells[0];
                    const name = cell?.querySelector('.table-member-name');
                    if (!cell || !name || cell.dataset.identityEnhanced === 'true') return;

                    const phone = cell.querySelector('.table-member-phone');
                    const registration = cell.querySelector('.table-sub');
                    const identity = document.createElement('div');
                    identity.className = 'member-identity';

                    const avatar = document.createElement('span');
                    avatar.className = 'member-avatar';
                    avatar.setAttribute('aria-hidden', 'true');
                    avatar.textContent = initials(name.textContent);

                    const copy = document.createElement('div');
                    copy.className = 'member-identity-copy';
                    copy.append(name);
                    if (phone) copy.append(phone);
                    if (registration) copy.append(registration);
                    identity.append(avatar, copy);
                    cell.replaceChildren(identity);
                    cell.dataset.identityEnhanced = 'true';
                });
            }

            function enhanceLayout() {
                movePrimaryAction();
                enhanceMemberIdentity();
            }

            document.addEventListener('DOMContentLoaded', enhanceLayout);
            new MutationObserver(enhanceLayout).observe(list, { childList: true, subtree: true });
        })();
