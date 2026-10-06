import { LANGS, type Lang } from './i18n';

// Each row follows LANGS order. Product names and currency codes remain unchanged.
const rows = `
Log In|Ingia|Se connecter|تسجيل الدخول|Iniciar sesión|Entrar|Anmelden|Accedi|登录|लॉग इन
Sign in to your shop account|Ingia kwenye akaunti ya duka lako|Connectez-vous au compte de votre boutique|سجّل الدخول إلى حساب متجرك|Accede a la cuenta de tu tienda|Entre na conta da sua loja|Melden Sie sich bei Ihrem Shopkonto an|Accedi al tuo negozio|登录您的店铺账户|अपनी दुकान के खाते में प्रवेश करें
Shop Name or Email|Jina la duka au barua pepe|Nom de boutique ou e-mail|اسم المتجر أو البريد الإلكتروني|Nombre de tienda o correo|Nome da loja ou e-mail|Shopname oder E-Mail|Nome negozio o email|店铺名称或邮箱|दुकान का नाम या ईमेल
Password|Nenosiri|Mot de passe|كلمة المرور|Contraseña|Senha|Passwort|Password|密码|पासवर्ड
Remember me|Nikumbuke|Se souvenir de moi|تذكرني|Recordarme|Lembrar de mim|Angemeldet bleiben|Ricordami|记住我|मुझे याद रखें
Forgot Password?|Umesahau nenosiri?|Mot de passe oublié ?|نسيت كلمة المرور؟|¿Olvidaste la contraseña?|Esqueceu a senha?|Passwort vergessen?|Password dimenticata?|忘记密码？|पासवर्ड भूल गए?
Ask your shop admin to reset your password.|Mwombe msimamizi wa duka abadilishe nenosiri lako.|Demandez à votre administrateur de réinitialiser votre mot de passe.|اطلب من مسؤول المتجر إعادة تعيين كلمة المرور.|Pide al administrador que restablezca tu contraseña.|Peça ao administrador para redefinir sua senha.|Bitten Sie Ihren Shopadministrator, Ihr Passwort zurückzusetzen.|Chiedi all’amministratore di reimpostare la password.|请联系店铺管理员重置密码。|दुकान के व्यवस्थापक से पासवर्ड रीसेट करने को कहें।
Shop name, email or password is incorrect|Jina la duka, barua pepe au nenosiri si sahihi|Nom de boutique, e-mail ou mot de passe incorrect|اسم المتجر أو البريد الإلكتروني أو كلمة المرور غير صحيحة|Nombre, correo o contraseña incorrectos|Nome, e-mail ou senha incorretos|Shopname, E-Mail oder Passwort ist falsch|Nome, email o password non corretti|店铺名称、邮箱或密码不正确|दुकान का नाम, ईमेल या पासवर्ड गलत है
OR|AU|OU|أو|O|OU|ODER|OPPURE|或|या
Create Account|Fungua akaunti|Créer un compte|إنشاء حساب|Crear cuenta|Criar conta|Konto erstellen|Crea account|创建账户|खाता बनाएँ
Create Your Account|Fungua akaunti yako|Créez votre compte|أنشئ حسابك|Crea tu cuenta|Crie sua conta|Erstellen Sie Ihr Konto|Crea il tuo account|创建您的账户|अपना खाता बनाएँ
Shop Name|Jina la duka|Nom de la boutique|اسم المتجر|Nombre de la tienda|Nome da loja|Shopname|Nome del negozio|店铺名称|दुकान का नाम
Email|Barua pepe|E-mail|البريد الإلكتروني|Correo electrónico|E-mail|E-Mail|Email|邮箱|ईमेल
Confirm Password|Thibitisha nenosiri|Confirmer le mot de passe|تأكيد كلمة المرور|Confirmar contraseña|Confirmar senha|Passwort bestätigen|Conferma password|确认密码|पासवर्ड की पुष्टि करें
I agree to the Terms & Conditions and Privacy Policy|Nakubali Masharti na Sera ya Faragha|J’accepte les conditions générales et la politique de confidentialité|أوافق على الشروط والأحكام وسياسة الخصوصية|Acepto los términos y la política de privacidad|Aceito os termos e a política de privacidade|Ich akzeptiere die AGB und die Datenschutzerklärung|Accetto i termini e l’informativa sulla privacy|我同意条款和隐私政策|मैं नियमों और गोपनीयता नीति से सहमत हूँ
Already have an account?|Tayari una akaunti?|Vous avez déjà un compte ?|لديك حساب بالفعل؟|¿Ya tienes una cuenta?|Já tem uma conta?|Sie haben bereits ein Konto?|Hai già un account?|已有账户？|पहले से खाता है?
Password must be at least 6 characters|Nenosiri liwe na angalau herufi 6|Le mot de passe doit contenir au moins 6 caractères|يجب أن تتكون كلمة المرور من 6 أحرف على الأقل|La contraseña debe tener al menos 6 caracteres|A senha deve ter pelo menos 6 caracteres|Das Passwort muss mindestens 6 Zeichen haben|La password deve avere almeno 6 caratteri|密码至少需要6个字符|पासवर्ड में कम से कम 6 अक्षर होने चाहिए
Passwords do not match|Manenosiri hayafanani|Les mots de passe ne correspondent pas|كلمتا المرور غير متطابقتين|Las contraseñas no coinciden|As senhas não coincidem|Die Passwörter stimmen nicht überein|Le password non coincidono|密码不一致|पासवर्ड मेल नहीं खाते
Please accept the Terms & Privacy Policy|Tafadhali kubali Masharti na Sera ya Faragha|Veuillez accepter les conditions et la politique de confidentialité|يرجى الموافقة على الشروط وسياسة الخصوصية|Acepta los términos y la política de privacidad|Aceite os termos e a política de privacidade|Bitte akzeptieren Sie die AGB und Datenschutzerklärung|Accetta i termini e l’informativa sulla privacy|请同意条款和隐私政策|कृपया नियमों और गोपनीयता नीति को स्वीकार करें
Change logo|Badilisha nembo|Changer le logo|تغيير الشعار|Cambiar logo|Alterar logotipo|Logo ändern|Cambia logo|更换标志|लोगो बदलें
Upload shop logo|Pakia nembo ya duka|Importer le logo|تحميل شعار المتجر|Subir logo de tienda|Enviar logotipo da loja|Shoplogo hochladen|Carica logo del negozio|上传店铺标志|दुकान का लोगो अपलोड करें
Shop logo|Nembo ya duka|Logo de boutique|شعار المتجر|Logo de tienda|Logotipo da loja|Shoplogo|Logo del negozio|店铺标志|दुकान का लोगो
Show password|Onyesha nenosiri|Afficher le mot de passe|إظهار كلمة المرور|Mostrar contraseña|Mostrar senha|Passwort anzeigen|Mostra password|显示密码|पासवर्ड दिखाएँ
Hide password|Ficha nenosiri|Masquer le mot de passe|إخفاء كلمة المرور|Ocultar contraseña|Ocultar senha|Passwort verbergen|Nascondi password|隐藏密码|पासवर्ड छिपाएँ
Dark mode|Hali ya giza|Mode sombre|الوضع الداكن|Modo oscuro|Modo escuro|Dunkler Modus|Modalità scura|深色模式|डार्क मोड
Light mode|Hali ya mwanga|Mode clair|الوضع الفاتح|Modo claro|Modo claro|Heller Modus|Modalità chiara|浅色模式|लाइट मोड
Kenyan Shilling|Shilingi ya Kenya|Shilling kényan|الشلن الكيني|Chelín keniano|Xelim queniano|Kenianischer Schilling|Scellino keniota|肯尼亚先令|केन्याई शिलिंग
Ugandan Shilling|Shilingi ya Uganda|Shilling ougandais|الشلن الأوغندي|Chelín ugandés|Xelim ugandês|Ugandischer Schilling|Scellino ugandese|乌干达先令|युगांडाई शिलिंग
Tanzanian Shilling|Shilingi ya Tanzania|Shilling tanzanien|الشلن التنزاني|Chelín tanzano|Xelim tanzaniano|Tansanischer Schilling|Scellino tanzaniano|坦桑尼亚先令|तंजानियाई शिलिंग
US Dollar|Dola ya Marekani|Dollar américain|الدولار الأمريكي|Dólar estadounidense|Dólar americano|US-Dollar|Dollaro USA|美元|अमेरिकी डॉलर
Choose Your Plan|Chagua mpango wako|Choisissez votre forfait|اختر خطتك|Elige tu plan|Escolha seu plano|Wählen Sie Ihren Tarif|Scegli il tuo piano|选择您的套餐|अपनी योजना चुनें
Unlock more features and grow your business with SHOPBOOK|Fungua huduma zaidi na kukuza biashara yako na SHOPBOOK|Accédez à plus de fonctionnalités et développez votre activité avec SHOPBOOK|افتح المزيد من الميزات ونمِّ أعمالك مع SHOPBOOK|Accede a más funciones y haz crecer tu negocio con SHOPBOOK|Tenha mais recursos e amplie seu negócio com SHOPBOOK|Nutzen Sie mehr Funktionen und wachsen Sie mit SHOPBOOK|Sblocca più funzioni e fai crescere la tua attività con SHOPBOOK|使用 SHOPBOOK 解锁更多功能并拓展业务|SHOPBOOK के साथ अधिक सुविधाएँ पाएँ और अपना व्यवसाय बढ़ाएँ
Monthly|Kila mwezi|Mensuel|شهري|Mensual|Mensal|Monatlich|Mensile|月付|मासिक
Yearly (Save 10%)|Kila mwaka (Okoa 10%)|Annuel (−10 %)|سنوي (وفّر 10٪)|Anual (Ahorra 10%)|Anual (Economize 10%)|Jährlich (10% sparen)|Annuale (Risparmia 10%)|年付（省10%）|वार्षिक (10% बचाएँ)
Save 10%|Okoa 10%|Économisez 10 %|وفّر 10٪|Ahorra 10%|Economize 10%|10% sparen|Risparmia 10%|省10%|10% बचाएँ
BEST OPTION|CHAGUO BORA|MEILLEUR CHOIX|أفضل خيار|MEJOR OPCIÓN|MELHOR OPÇÃO|BESTE WAHL|SCELTA MIGLIORE|最佳选择|सर्वश्रेष्ठ विकल्प
/ month|/ mwezi|/ mois|/ شهر|/ mes|/ mês|/ Monat|/ mese|/ 月|/ माह
/ year|/ mwaka|/ an|/ سنة|/ año|/ ano|/ Jahr|/ anno|/ 年|/ वर्ष
Billed yearly|Hulipwa kila mwaka|Facturé annuellement|تُدفع سنويًا|Facturado anualmente|Cobrado anualmente|Jährliche Abrechnung|Fatturato annualmente|按年计费|वार्षिक बिलिंग
Start selling.|Anza kuuza.|Commencez à vendre.|ابدأ البيع.|Empieza a vender.|Comece a vender.|Starten Sie den Verkauf.|Inizia a vendere.|开始销售。|बिक्री शुरू करें।
Manage your growing shop.|Simamia duka lako linalokua.|Gérez votre boutique en croissance.|أدِر متجرك المتنامي.|Gestiona tu tienda en crecimiento.|Gerencie sua loja em crescimento.|Verwalten Sie Ihren wachsenden Shop.|Gestisci il tuo negozio in crescita.|管理不断发展的店铺。|अपनी बढ़ती दुकान का प्रबंधन करें।
Run the whole business.|Endesha biashara nzima.|Gérez toute votre activité.|أدِر النشاط التجاري بالكامل.|Dirige todo tu negocio.|Gerencie todo o negócio.|Steuern Sie Ihr gesamtes Unternehmen.|Gestisci l’intera attività.|管理整个企业。|पूरा व्यवसाय चलाएँ।
Everything in Basic, plus:|Yote ya Basic, pamoja na:|Tout Basic, plus :|كل ما في Basic، بالإضافة إلى:|Todo lo de Basic, más:|Tudo do Basic, mais:|Alles aus Basic, plus:|Tutto di Basic, più:|Basic 的所有功能，另加：|Basic की सभी सुविधाएँ, साथ में:
Everything in Plus, plus:|Yote ya Plus, pamoja na:|Tout Plus, plus :|كل ما في Plus، بالإضافة إلى:|Todo lo de Plus, más:|Tudo do Plus, mais:|Alles aus Plus, plus:|Tutto di Plus, più:|Plus 的所有功能，另加：|Plus की सभी सुविधाएँ, साथ में:
Continue with {x} Plan|Endelea na mpango wa {x}|Continuer avec le forfait {x}|المتابعة بخطة {x}|Continuar con el plan {x}|Continuar com o plano {x}|Mit Tarif {x} fortfahren|Continua con il piano {x}|继续选择 {x} 套餐|{x} योजना के साथ जारी रखें
Get Started with Your 30-Day Free Trial|Anza majaribio ya bure ya siku 30|Commencer l’essai gratuit de 30 jours|ابدأ تجربتك المجانية لمدة 30 يومًا|Comienza tu prueba gratis de 30 días|Comece seu teste grátis de 30 dias|30 Tage kostenlos testen|Inizia la prova gratuita di 30 giorni|开始30天免费试用|30 दिन का निःशुल्क परीक्षण शुरू करें
No payment required • Cancel anytime|Hakuna malipo • Ghairi wakati wowote|Sans paiement • Annulez à tout moment|لا يتطلب الدفع • ألغِ في أي وقت|Sin pago • Cancela cuando quieras|Sem pagamento • Cancele quando quiser|Keine Zahlung nötig • Jederzeit kündbar|Nessun pagamento • Annulla quando vuoi|无需付款 • 随时取消|भुगतान आवश्यक नहीं • कभी भी रद्द करें
Pay with M-Pesa|Lipa kwa M-Pesa|Payer avec M-Pesa|الدفع عبر M-Pesa|Pagar con M-Pesa|Pagar com M-Pesa|Mit M-Pesa bezahlen|Paga con M-Pesa|使用 M-Pesa 支付|M-Pesa से भुगतान करें
M-Pesa phone number|Nambari ya simu ya M-Pesa|Numéro M-Pesa|رقم هاتف M-Pesa|Número de M-Pesa|Número de M-Pesa|M-Pesa-Telefonnummer|Numero M-Pesa|M-Pesa 手机号|M-Pesa फ़ोन नंबर
Send payment request|Tuma ombi la malipo|Envoyer la demande de paiement|إرسال طلب الدفع|Enviar solicitud de pago|Enviar pedido de pagamento|Zahlungsanfrage senden|Invia richiesta di pagamento|发送付款请求|भुगतान अनुरोध भेजें
Use the 30-day free trial instead|Tumia majaribio ya bure ya siku 30 badala yake|Utiliser l’essai gratuit de 30 jours|استخدم التجربة المجانية لمدة 30 يومًا بدلًا من ذلك|Usar la prueba gratis de 30 días|Usar o teste grátis de 30 dias|Stattdessen 30 Tage kostenlos testen|Usa invece la prova gratuita di 30 giorni|改用30天免费试用|इसके बजाय 30 दिन का निःशुल्क परीक्षण लें
Your plan is only activated after payment is confirmed.|Mpango wako unaanza baada ya malipo kuthibitishwa.|Votre forfait est activé après confirmation du paiement.|تُفعّل خطتك فقط بعد تأكيد الدفع.|Tu plan se activa al confirmar el pago.|Seu plano é ativado após confirmar o pagamento.|Ihr Tarif wird erst nach Zahlungsbestätigung aktiviert.|Il piano si attiva dopo la conferma del pagamento.|付款确认后才会激活套餐。|भुगतान की पुष्टि के बाद ही योजना सक्रिय होगी।
Enter a valid Kenyan M-Pesa phone number|Weka nambari sahihi ya M-Pesa ya Kenya|Saisissez un numéro M-Pesa kényan valide|أدخل رقم هاتف M-Pesa كينيًا صالحًا|Introduce un número M-Pesa keniano válido|Insira um número M-Pesa queniano válido|Geben Sie eine gültige kenianische M-Pesa-Nummer ein|Inserisci un numero M-Pesa keniota valido|请输入有效的肯尼亚 M-Pesa 手机号|एक मान्य केन्याई M-Pesa नंबर डालें
Online payments are coming soon. Start the free trial for now — your data stays when you upgrade.|Malipo ya mtandaoni yanakuja. Anza majaribio ya bure — data yako itabaki ukiboresha.|Les paiements en ligne arrivent bientôt. Essayez gratuitement : vos données seront conservées.|الدفع الإلكتروني قريبًا. ابدأ التجربة المجانية الآن — تبقى بياناتك عند الترقية.|Los pagos en línea llegarán pronto. Prueba gratis; tus datos se conservan al mejorar.|Pagamentos online em breve. Comece o teste grátis; seus dados ficam ao atualizar.|Onlinezahlungen folgen bald. Starten Sie die Testphase; Ihre Daten bleiben beim Upgrade erhalten.|I pagamenti online arriveranno presto. Inizia la prova: i dati restano dopo l’upgrade.|在线支付即将推出。请先免费试用，升级时会保留数据。|ऑनलाइन भुगतान जल्द आएगा। अभी निःशुल्क परीक्षण लें; अपग्रेड पर डेटा रहेगा।
Dashboard basic|Dashibodi ya msingi|Tableau de bord de base|لوحة تحكم أساسية|Panel básico|Painel básico|Basis-Dashboard|Dashboard base|基础仪表盘|बुनियादी डैशबोर्ड
Basic products|Bidhaa za msingi|Produits de base|منتجات أساسية|Productos básicos|Produtos básicos|Basis-Produkte|Prodotti base|基础商品|बुनियादी उत्पाद
Basic history|Historia ya msingi|Historique de base|سجل أساسي|Historial básico|Histórico básico|Basis-Verlauf|Cronologia base|基础历史记录|बुनियादी इतिहास
Basic settings|Mipangilio ya msingi|Paramètres de base|إعدادات أساسية|Ajustes básicos|Configurações básicas|Basis-Einstellungen|Impostazioni base|基础设置|बुनियादी सेटिंग्स
Returns|Marejesho|Retours|المرتجعات|Devoluciones|Devoluções|Retouren|Resi|退货|वापसी
Credit & partial|Mkopo na malipo ya sehemu|Crédit et paiements partiels|ائتمان ودفع جزئي|Crédito y pagos parciales|Crédito e pagamentos parciais|Kredit und Teilzahlungen|Credito e pagamenti parziali|赊账和部分付款|उधार और आंशिक भुगतान
Mixed payments|Malipo mchanganyiko|Paiements mixtes|مدفوعات مختلطة|Pagos mixtos|Pagamentos mistos|Gemischte Zahlungen|Pagamenti misti|混合付款|मिश्रित भुगतान
Cash-up (end of day)|Hesabu ya fedha (mwisho wa siku)|Clôture de caisse|إقفال الصندوق (نهاية اليوم)|Cierre de caja|Fechamento de caixa|Kassenabschluss|Chiusura cassa|日终结账|दिन के अंत में नकद मिलान
Settings (advanced)|Mipangilio ya juu|Paramètres avancés|إعدادات متقدمة|Ajustes avanzados|Configurações avançadas|Erweiterte Einstellungen|Impostazioni avanzate|高级设置|उन्नत सेटिंग्स
Advanced analytics|Uchambuzi wa juu|Analyses avancées|تحليلات متقدمة|Análisis avanzados|Análises avançadas|Erweiterte Analysen|Analisi avanzate|高级分析|उन्नत विश्लेषण
Advanced AI|AI ya juu|IA avancée|ذكاء اصطناعي متقدم|IA avanzada|IA avançada|Erweiterte KI|IA avanzata|高级AI|उन्नत AI
Advanced permissions|Ruhusa za juu|Autorisations avancées|صلاحيات متقدمة|Permisos avanzados|Permissões avançadas|Erweiterte Berechtigungen|Permessi avanzati|高级权限|उन्नत अनुमतियाँ
Multi-shop|Maduka mengi|Multi-boutiques|متاجر متعددة|Varias tiendas|Várias lojas|Mehrere Shops|Più negozi|多店铺|कई दुकानें
Advanced integrations|Miunganisho ya juu|Intégrations avancées|تكاملات متقدمة|Integraciones avanzadas|Integrações avançadas|Erweiterte Integrationen|Integrazioni avanzate|高级集成|उन्नत एकीकरण
Custom reports|Ripoti maalum|Rapports personnalisés|تقارير مخصصة|Informes personalizados|Relatórios personalizados|Individuelle Berichte|Report personalizzati|自定义报表|कस्टम रिपोर्ट
Priority support|Msaada wa kipaumbele|Support prioritaire|دعم ذو أولوية|Soporte prioritario|Suporte prioritário|Prioritäts-Support|Supporto prioritario|优先支持|प्राथमिकता समर्थन
Full settings access|Ufikiaji kamili wa mipangilio|Accès complet aux paramètres|وصول كامل للإعدادات|Acceso completo a ajustes|Acesso total às configurações|Voller Einstellungszugriff|Accesso completo alle impostazioni|完整设置权限|सभी सेटिंग्स की पहुँच
Call support|Piga simu kwa msaada|Appeler le support|اتصل بالدعم|Llamar al soporte|Ligar para o suporte|Support anrufen|Chiama il supporto|致电支持|समर्थन को कॉल करें
Menu|Menyu|Menu|القائمة|Menú|Menu|Menü|Menu|菜单|मेन्यू
Close menu|Funga menyu|Fermer le menu|إغلاق القائمة|Cerrar menú|Fechar menu|Menü schließen|Chiudi menu|关闭菜单|मेन्यू बंद करें
Notifications|Arifa|Notifications|الإشعارات|Notificaciones|Notificações|Benachrichtigungen|Notifiche|通知|सूचनाएँ
AI assistant|Msaidizi wa AI|Assistant IA|المساعد الذكي|Asistente IA|Assistente IA|KI-Assistent|Assistente IA|AI助手|AI सहायक
Sign in with Google for AI|Ingia kwa Google kutumia AI|Se connecter avec Google pour l’IA|تسجيل الدخول عبر Google للذكاء الاصطناعي|Entrar con Google para IA|Entrar com Google para IA|Mit Google für KI anmelden|Accedi con Google per l’IA|通过 Google 登录使用 AI|AI के लिए Google से साइन इन करें
Confirm Stock In|Thibitisha kuingiza bidhaa|Confirmer l’entrée de stock|تأكيد إدخال المخزون|Confirmar entrada|Confirmar entrada|Bestandseingang bestätigen|Conferma entrata scorte|确认入库|स्टॉक आवक की पुष्टि करें
Confirm Stock Out|Thibitisha kutoa bidhaa|Confirmer la sortie de stock|تأكيد إخراج المخزون|Confirmar salida|Confirmar saída|Bestandsabgang bestätigen|Conferma uscita scorte|确认出库|स्टॉक जावक की पुष्टि करें
Confirm Adjustment|Thibitisha marekebisho|Confirmer l’ajustement|تأكيد التسوية|Confirmar ajuste|Confirmar ajuste|Korrektur bestätigen|Conferma rettifica|确认调整|समायोजन की पुष्टि करें
Confirm Cash-up|Thibitisha hesabu ya fedha|Confirmer la clôture|تأكيد إقفال الصندوق|Confirmar cierre de caja|Confirmar fechamento|Kassenabschluss bestätigen|Conferma chiusura cassa|确认结账|नकद मिलान की पुष्टि करें
Opening stock|Bidhaa za mwanzo|Stock initial|المخزون الافتتاحي|Existencias iniciales|Estoque inicial|Anfangsbestand|Scorte iniziali|期初库存|प्रारंभिक स्टॉक
Failed|Imeshindikana|Échec|فشل|Error|Falhou|Fehlgeschlagen|Operazione fallita|失败|विफल
Stopped|Imesimamishwa|Arrêté|تم الإيقاف|Detenido|Interrompido|Gestoppt|Interrotto|已停止|रोक दिया गया
Not enough stock for {name} (available {qty})|Bidhaa hazitoshi kwa {name} (zilizopo {qty})|Stock insuffisant pour {name} (disponible {qty})|المخزون غير كافٍ لـ {name} (المتاح {qty})|Stock insuficiente de {name} (disponible {qty})|Estoque insuficiente de {name} (disponível {qty})|Nicht genug Bestand für {name} (verfügbar {qty})|Scorte insufficienti per {name} (disponibili {qty})|{name} 库存不足（可用 {qty}）|{name} का स्टॉक अपर्याप्त (उपलब्ध {qty})
Invalid quantity for {name}|Idadi si sahihi kwa {name}|Quantité invalide pour {name}|كمية غير صالحة لـ {name}|Cantidad no válida para {name}|Quantidade inválida para {name}|Ungültige Menge für {name}|Quantità non valida per {name}|{name} 数量无效|{name} की मात्रा अमान्य
Insufficient stock: {name} (available {qty})|Bidhaa hazitoshi: {name} (zilizopo {qty})|Stock insuffisant : {name} (disponible {qty})|مخزون غير كافٍ: {name} (المتاح {qty})|Stock insuficiente: {name} (disponible {qty})|Estoque insuficiente: {name} (disponível {qty})|Unzureichender Bestand: {name} (verfügbar {qty})|Scorte insufficienti: {name} (disponibili {qty})|库存不足：{name}（可用 {qty}）|अपर्याप्त स्टॉक: {name} (उपलब्ध {qty})
Only {qty} of {name} can be returned|Ni {qty} tu za {name} zinaweza kurejeshwa|Seulement {qty} de {name} peuvent être retournés|يمكن إرجاع {qty} فقط من {name}|Solo se pueden devolver {qty} de {name}|Só podem ser devolvidos {qty} de {name}|Nur {qty} von {name} können retourniert werden|È possibile restituire solo {qty} di {name}|{name} 最多可退 {qty} 件|{name} की केवल {qty} इकाइयाँ लौटाई जा सकती हैं
`.trim().split('\n').map(row => row.split('|'));

const dictionary = new Map(rows.map(row => [(row[0] ?? '').toLowerCase(), row]));
export function translateText(lang: Lang, text: string, x?: string | number) {
  const patterns: [RegExp, string, string[]][] = [
    [/^Not enough stock for (.+) \(available (.+)\)$/, 'Not enough stock for {name} (available {qty})', ['name', 'qty']],
    [/^Insufficient stock: (.+) \(available (.+)\)$/, 'Insufficient stock: {name} (available {qty})', ['name', 'qty']],
    [/^Invalid quantity for (.+)$/, 'Invalid quantity for {name}', ['name']],
    [/^Only (.+) of (.+) can be returned$/, 'Only {qty} of {name} can be returned', ['qty', 'name']],
  ];
  for (const [pattern, key, fields] of patterns) {
    const match = text.match(pattern);
    if (match) { let value = dictionary.get(key.toLowerCase())?.[LANGS.indexOf(lang)] ?? key; fields.forEach((field, index) => { value = value.replace(`{${field}}`, match[index + 1] ?? ''); }); return value; }
  }
  const translated = dictionary.get(text.toLowerCase())?.[LANGS.indexOf(lang)] ?? text;
  return x === undefined ? translated : translated.replace('{x}', String(x));
}

export function translateCurrent(text: string) {
  const saved = typeof window === 'undefined' ? 'English' : localStorage.getItem('shopbook.language');
  const lang = LANGS.find(l => l === saved) ?? 'English';
  return translateText(lang, text);
}
