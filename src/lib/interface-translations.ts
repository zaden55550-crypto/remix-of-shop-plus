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
A reason is required|Sababu inahitajika|Un motif est requis|السبب مطلوب|Se requiere un motivo|É necessário um motivo|Ein Grund ist erforderlich|È richiesto un motivo|必须填写原因|कारण आवश्यक है
ADJUSTMENT|MAREKEBISHO|AJUSTEMENT|تسوية|AJUSTE|AJUSTE|KORREKTUR|RETTIFICA|调整|समायोजन
Add|Ongeza|Ajouter|إضافة|Añadir|Adicionar|Hinzufügen|Aggiungi|添加|जोड़ें
Add Product|Ongeza bidhaa|Ajouter un produit|إضافة منتج|Añadir producto|Adicionar produto|Produkt hinzufügen|Aggiungi prodotto|添加商品|उत्पाद जोड़ें
Add customer|Ongeza mteja|Ajouter un client|إضافة عميل|Añadir cliente|Adicionar cliente|Kunden hinzufügen|Aggiungi cliente|添加客户|ग्राहक जोड़ें
Added|Imeongezwa|Ajouté|تمت الإضافة|Añadido|Adicionado|Hinzugefügt|Aggiunto|已添加|जोड़ा गया
Adjustment|Marekebisho|Ajustement|تسوية|Ajuste|Ajuste|Korrektur|Rettifica|调整|समायोजन
Adjustments|Marekebisho|Ajustements|تسويات|Ajustes|Ajustes|Korrekturen|Rettifiche|调整|समायोजन
Admin|Msimamizi|Administrateur|مسؤول|Administrador|Administrador|Administrator|Amministratore|管理员|व्यवस्थापक
All Products|Bidhaa zote|Tous les produits|جميع المنتجات|Todos los productos|Todos os produtos|Alle Produkte|Tutti i prodotti|所有商品|सभी उत्पाद
All time|Muda wote|Toute la période|كل الفترات|Todo el período|Todo o período|Gesamter Zeitraum|Tutto il periodo|全部时间|पूरी अवधि
Allocate the full total (use Credit for the unpaid part)|Gawa jumla yote (tumia Mkopo kwa sehemu ambayo haijalipwa)|Répartissez le total intégral (utilisez Crédit pour la partie impayée)|وزّع المبلغ الإجمالي بالكامل (استخدم الائتمان للجزء غير المدفوع)|Asigna el total completo (usa Crédito para la parte pendiente)|Distribua o total completo (use Crédito para a parte não paga)|Gesamtbetrag vollständig zuordnen (für den unbezahlten Teil Kredit verwenden)|Ripartisci l'intero totale (usa Credito per la parte non pagata)|分配全部总额（未付部分使用赊账）|पूरी कुल राशि आवंटित करें (बकाया हिस्से के लिए उधार का उपयोग करें)
Allocated|Imegawiwa|Réparti|تم التوزيع|Asignado|Distribuído|Zugeordnet|Ripartito|已分配|आवंटित
Already exists|Tayari ipo|Existe déjà|موجود بالفعل|Ya existe|Já existe|Bereits vorhanden|Esiste già|已存在|पहले से मौजूद है
Already received or not sent|Tayari imepokelewa au haijatumwa|Déjà reçu ou non envoyé|تم الاستلام بالفعل أو لم يُرسل|Ya recibido o no enviado|Já recebido ou não enviado|Bereits empfangen oder nicht gesendet|Già ricevuto o non inviato|已接收或未发送|पहले ही प्राप्त या भेजा नहीं गया
Amount|Kiasi|Montant|المبلغ|Importe|Valor|Betrag|Importo|金额|राशि
Amount is more than the outstanding balance|Kiasi kinazidi salio linalodaiwa|Le montant dépasse le solde dû|المبلغ أكبر من الرصيد المستحق|El importe supera el saldo pendiente|O valor excede o saldo devedor|Der Betrag übersteigt den offenen Saldo|L'importo supera il saldo dovuto|金额超过未付余额|राशि बकाया शेष से अधिक है
Authorized adjustment|Marekebisho yaliyoidhinishwa|Ajustement autorisé|تسوية معتمدة|Ajuste autorizado|Ajuste autorizado|Genehmigte Korrektur|Rettifica autorizzata|已授权调整|अधिकृत समायोजन
Auto|Otomatiki|Auto|تلقائي|Auto|Automático|Automatisch|Automatico|自动|स्वचालित
Back|Rudi|Retour|رجوع|Atrás|Voltar|Zurück|Indietro|返回|वापस
Bank|Benki|Banque|بنك|Banco|Banco|Bank|Banca|银行|बैंक
Barcode|Msimbo pau|Code-barres|الرمز الشريطي|Código de barras|Código de barras|Barcode|Codice a barre|条形码|बारकोड
Barcode already used by another product|Msimbo pau tayari unatumiwa na bidhaa nyingine|Code-barres déjà utilisé par un autre produit|الرمز الشريطي مستخدم لمنتج آخر|Otro producto ya usa este código de barras|Código de barras já usado por outro produto|Barcode wird bereits für ein anderes Produkt verwendet|Codice a barre già usato da un altro prodotto|条形码已被其他商品使用|बारकोड दूसरे उत्पाद में पहले से उपयोग है
Barcode not found — add it as a new product|Msimbo pau haujapatikana — uongeze kama bidhaa mpya|Code-barres introuvable — ajoutez-le comme nouveau produit|الرمز الشريطي غير موجود — أضفه كمنتج جديد|Código de barras no encontrado — añádelo como producto nuevo|Código de barras não encontrado — adicione como novo produto|Barcode nicht gefunden — als neues Produkt hinzufügen|Codice a barre non trovato — aggiungilo come nuovo prodotto|未找到条形码 — 请添加为新商品|बारकोड नहीं मिला — इसे नए उत्पाद के रूप में जोड़ें
Barcode not found — add it in Inventory|Msimbo pau haujapatikana — uongeze kwenye Orodha ya bidhaa|Code-barres introuvable — ajoutez-le dans Stock|الرمز الشريطي غير موجود — أضفه في المخزون|Código de barras no encontrado — añádelo en Inventario|Código de barras não encontrado — adicione no Estoque|Barcode nicht gefunden — im Inventar hinzufügen|Codice a barre non trovato — aggiungilo in Inventario|未找到条形码 — 请在库存中添加|बारकोड नहीं मिला — इसे इन्वेंट्री में जोड़ें
Billing|Bili|Facturation|الفوترة|Facturación|Faturação|Abrechnung|Fatturazione|账单|बिलिंग
Brand|Chapa|Marque|العلامة التجارية|Marca|Marca|Marke|Marca|品牌|ब्रांड
Brands|Chapa|Marques|العلامات التجارية|Marcas|Marcas|Marken|Marche|品牌|ब्रांड
Buying price|Bei ya kununua|Prix d'achat|سعر الشراء|Precio de compra|Preço de compra|Einkaufspreis|Prezzo d'acquisto|进价|खरीद मूल्य
By payment|Kwa njia ya malipo|Par mode de paiement|حسب طريقة الدفع|Por método de pago|Por forma de pagamento|Nach Zahlungsart|Per metodo di pagamento|按支付方式|भुगतान विधि के अनुसार
CANCELLED|IMEGHAIRIWA|ANNULÉ|ملغى|CANCELADO|CANCELADO|STORNIERT|ANNULLATO|已取消|रद्द
CASH HISTORY|HISTORIA YA TASLIMU|HISTORIQUE DE CAISSE|سجل النقد|HISTORIAL DE CAJA|HISTÓRICO DE CAIXA|KASSENVERLAUF|STORICO CASSA|现金记录|नकदी इतिहास
CASH IN|TASLIMU ZILIZOINGIA|ENTRÉE DE CAISSE|نقد وارد|ENTRADA DE EFECTIVO|ENTRADA DE CAIXA|BAREINZAHLUNG|ENTRATA DI CASSA|现金收入|नकदी आवक
CASH OUT|TASLIMU ZILIZOTOKA|SORTIE DE CAISSE|نقد صادر|SALIDA DE EFECTIVO|SAÍDA DE CAIXA|BARAUSZAHLUNG|USCITA DI CASSA|现金支出|नकदी जावक
CASH UP|FUNGA HESABU YA TASLIMU|CLÔTURE DE CAISSE|إقفال الصندوق|CIERRE DE CAJA|FECHO DE CAIXA|KASSENABSCHLUSS|CHIUSURA CASSA|现金结账|नकदी मिलान
Camera scanning isn't available on this device. Type the barcode instead.|Kuchanganua kwa kamera hakupatikani kwenye kifaa hiki. Andika msimbo pau badala yake.|Le scan par caméra n'est pas disponible sur cet appareil. Saisissez le code-barres.|المسح بالكاميرا غير متاح على هذا الجهاز. اكتب الرمز الشريطي بدلاً من ذلك.|El escaneo con cámara no está disponible en este dispositivo. Escribe el código de barras.|A leitura pela câmera não está disponível neste dispositivo. Digite o código de barras.|Kamera-Scanning ist auf diesem Gerät nicht verfügbar. Barcode stattdessen eingeben.|La scansione con fotocamera non è disponibile su questo dispositivo. Digita il codice a barre.|此设备不支持相机扫描。请手动输入条形码。|इस डिवाइस पर कैमरे से स्कैन उपलब्ध नहीं है। बारकोड टाइप करें।
Cancel|Ghairi|Annuler|إلغاء|Cancelar|Cancelar|Abbrechen|Annulla|取消|रद्द करें
Cancelled|Imeghairiwa|Annulé|ملغى|Cancelado|Cancelado|Storniert|Annullato|已取消|रद्द
Cart|Kikapu|Panier|السلة|Carrito|Carrinho|Warenkorb|Carrello|购物车|कार्ट
Cart is empty|Kikapu ni tupu|Le panier est vide|السلة فارغة|El carrito está vacío|O carrinho está vazio|Warenkorb ist leer|Il carrello è vuoto|购物车为空|कार्ट खाली है
Cash|Taslimu|Espèces|نقد|Efectivo|Dinheiro|Bargeld|Contanti|现金|नकद
Cash In|Taslimu zilizoingia|Entrée de caisse|نقد وارد|Entrada de efectivo|Entrada de caixa|Bareinzahlung|Entrata di cassa|现金收入|नकदी आवक
Cash Out|Taslimu zilizotoka|Sortie de caisse|نقد صادر|Salida de efectivo|Saída de caixa|Barauszahlung|Uscita di cassa|现金支出|नकदी जावक
Cash Refunds|Marejesho ya taslimu|Remboursements en espèces|مبالغ مستردة نقدًا|Reembolsos en efectivo|Reembolsos em dinheiro|Barrerückerstattungen|Rimborsi in contanti|现金退款|नकद धनवापसी
Cash Sales|Mauzo ya taslimu|Ventes en espèces|مبيعات نقدية|Ventas en efectivo|Vendas em dinheiro|Barverkäufe|Vendite in contanti|现金销售|नकद बिक्री
Cash-up saved|Hesabu ya kufunga taslimu imehifadhiwa|Clôture de caisse enregistrée|تم حفظ إقفال الصندوق|Cierre de caja guardado|Fecho de caixa salvo|Kassenabschluss gespeichert|Chiusura cassa salvata|现金结账已保存|नकदी मिलान सहेजा गया
Cashier|Mhudumu wa malipo|Caissier|أمين الصندوق|Cajero|Operador de caixa|Kassierer|Cassiere|收银员|कैशियर
Categories|Makundi|Catégories|الفئات|Categorías|Categorias|Kategorien|Categorie|分类|श्रेणियाँ
Category|Kundi|Catégorie|الفئة|Categoría|Categoria|Kategorie|Categoria|分类|श्रेणी
Choose Cash, M-Pesa or Bank|Chagua Taslimu, M-Pesa au Benki|Choisissez Espèces, M-Pesa ou Banque|اختر نقدًا أو M-Pesa أو بنكًا|Elige Efectivo, M-Pesa o Banco|Escolha Dinheiro, M-Pesa ou Banco|Bargeld, M-Pesa oder Bank wählen|Scegli Contanti, M-Pesa o Banca|选择现金、M-Pesa或银行|नकद, M-Pesa या बैंक चुनें
Choose a destination shop|Chagua duka la kupokea|Choisissez un magasin destinataire|اختر متجر الوجهة|Elige una tienda de destino|Escolha a loja de destino|Zielgeschäft wählen|Scegli il negozio di destinazione|选择目标门店|गंतव्य दुकान चुनें
Choose items to return|Chagua bidhaa za kurudisha|Choisissez les articles à retourner|اختر الأصناف المراد إرجاعها|Elige los artículos a devolver|Escolha os itens a devolver|Artikel zur Rückgabe wählen|Scegli gli articoli da restituire|选择退货商品|वापस करने वाले आइटम चुनें
Close|Funga|Fermer|إغلاق|Cerrar|Fechar|Schließen|Chiudi|关闭|बंद करें
Confirm|Thibitisha|Confirmer|تأكيد|Confirmar|Confirmar|Bestätigen|Conferma|确认|पुष्टि करें
Confirm Return|Thibitisha urejeshaji|Confirmer le retour|تأكيد الإرجاع|Confirmar devolución|Confirmar devolução|Rückgabe bestätigen|Conferma reso|确认退货|वापसी की पुष्टि करें
Confirm Sale|Thibitisha mauzo|Confirmer la vente|تأكيد البيع|Confirmar venta|Confirmar venda|Verkauf bestätigen|Conferma vendita|确认销售|बिक्री की पुष्टि करें
Continue|Endelea|Continuer|متابعة|Continuar|Continuar|Weiter|Continua|继续|जारी रखें
Cost value|Thamani ya gharama|Valeur au coût|القيمة بالتكلفة|Valor de coste|Valor de custo|Kostenwert|Valore al costo|成本价值|लागत मूल्य
Counted cash|Taslimu zilizohesabiwa|Espèces comptées|النقد المعدود|Efectivo contado|Dinheiro contado|Gezähltes Bargeld|Contanti contati|实点现金|गिनी गई नकदी
Counted stock can't be negative|Hesabu ya bidhaa haiwezi kuwa hasi|Le stock compté ne peut pas être négatif|لا يمكن أن يكون المخزون المعدود سالبًا|El stock contado no puede ser negativo|O estoque contado não pode ser negativo|Gezählter Bestand darf nicht negativ sein|La giacenza contata non può essere negativa|实盘库存不能为负数|गिना गया स्टॉक ऋणात्मक नहीं हो सकता
Counted stock matches the system|Hesabu ya bidhaa inalingana na mfumo|Le stock compté correspond au système|المخزون المعدود يطابق النظام|El stock contado coincide con el sistema|O estoque contado corresponde ao sistema|Gezählter Bestand stimmt mit dem System überein|La giacenza contata corrisponde al sistema|实盘库存与系统一致|गिना गया स्टॉक सिस्टम से मेल खाता है
Create Transfer|Unda uhamisho|Créer un transfert|إنشاء تحويل|Crear traslado|Criar transferência|Umlagerung erstellen|Crea trasferimento|创建调拨|स्थानांतरण बनाएं
Credit|Mkopo|Crédit|ائتمان|Crédito|Crédito|Kredit|Credito|赊账|उधार
Credit in favour|Salio kwa manufaa ya mteja|Solde créditeur|رصيد لصالح العميل|Saldo a favor|Saldo a favor|Guthaben|Credito a favore|客户贷方余额|ग्राहक के पक्ष में जमा शेष
Credit needs a registered customer|Mkopo unahitaji mteja aliyesajiliwa|Le crédit nécessite un client enregistré|الائتمان يتطلب عميلاً مسجلاً|El crédito requiere un cliente registrado|O crédito exige um cliente cadastrado|Kredit erfordert einen registrierten Kunden|Il credito richiede un cliente registrato|赊账需要已注册客户|उधार के लिए पंजीकृत ग्राहक आवश्यक है
Current stock|Stoki ya sasa|Stock actuel|المخزون الحالي|Stock actual|Estoque atual|Aktueller Bestand|Giacenza attuale|当前库存|वर्तमान स्टॉक
Customer|Mteja|Client|عميل|Cliente|Cliente|Kunde|Cliente|客户|ग्राहक
Customer added|Mteja ameongezwa|Client ajouté|تمت إضافة العميل|Cliente añadido|Cliente adicionado|Kunde hinzugefügt|Cliente aggiunto|客户已添加|ग्राहक जोड़ा गया
Customer credit|Salio la mteja|Avoir client|رصيد العميل الدائن|Crédito del cliente|Crédito do cliente|Kundenguthaben|Credito cliente|客户余额|ग्राहक जमा
Customer credit needs a registered customer|Salio la mteja linahitaji mteja aliyesajiliwa|L'avoir client nécessite un client enregistré|رصيد العميل الدائن يتطلب عميلاً مسجلاً|El crédito del cliente requiere un cliente registrado|O crédito do cliente exige um cliente cadastrado|Kundenguthaben erfordert einen registrierten Kunden|Il credito cliente richiede un cliente registrato|客户余额需要已注册客户|ग्राहक जमा के लिए पंजीकृत ग्राहक आवश्यक है
Customer debt|Deni la mteja|Dette client|دين العميل|Deuda del cliente|Dívida do cliente|Kundenschulden|Debito cliente|客户欠款|ग्राहक का बकाया
Customer name|Jina la mteja|Nom du client|اسم العميل|Nombre del cliente|Nome do cliente|Kundenname|Nome cliente|客户姓名|ग्राहक का नाम
Customer not found|Mteja hajapatikana|Client introuvable|العميل غير موجود|Cliente no encontrado|Cliente não encontrado|Kunde nicht gefunden|Cliente non trovato|未找到客户|ग्राहक नहीं मिला
Customers|Wateja|Clients|العملاء|Clientes|Clientes|Kunden|Clienti|客户|ग्राहक
Damaged|Imeharibika|Endommagé|تالف|Dañado|Danificado|Beschädigt|Danneggiato|损坏|क्षतिग्रस्त
Debt payment|Malipo ya deni|Règlement de dette|سداد الدين|Pago de deuda|Pagamento de dívida|Schuldentilgung|Pagamento debito|偿还欠款|बकाया भुगतान
Delete|Futa|Supprimer|حذف|Eliminar|Excluir|Löschen|Elimina|删除|हटाएं
Delete this product?|Ufute bidhaa hii?|Supprimer ce produit ?|حذف هذا المنتج؟|¿Eliminar este producto?|Excluir este produto?|Dieses Produkt löschen?|Eliminare questo prodotto?|删除此商品？|यह उत्पाद हटाएं?
Deleted|Imefutwa|Supprimé|تم الحذف|Eliminado|Excluído|Gelöscht|Eliminato|已删除|हटाया गया
Deleted product|Bidhaa iliyofutwa|Produit supprimé|منتج محذوف|Producto eliminado|Produto excluído|Gelöschtes Produkt|Prodotto eliminato|已删除商品|हटाया गया उत्पाद
Difference|Tofauti|Écart|الفرق|Diferencia|Diferença|Differenz|Differenza|差额|अंतर
Discount|Punguzo|Remise|خصم|Descuento|Desconto|Rabatt|Sconto|折扣|छूट
Discount can't exceed the subtotal|Punguzo haliwezi kuzidi jumla ndogo|La remise ne peut pas dépasser le sous-total|لا يمكن أن يتجاوز الخصم المجموع الفرعي|El descuento no puede superar el subtotal|O desconto não pode exceder o subtotal|Rabatt darf die Zwischensumme nicht übersteigen|Lo sconto non può superare il subtotale|折扣不能超过小计|छूट उप-योग से अधिक नहीं हो सकती
Enter a customer name|Weka jina la mteja|Saisissez un nom de client|أدخل اسم العميل|Introduce el nombre del cliente|Digite o nome do cliente|Kundennamen eingeben|Inserisci il nome del cliente|输入客户姓名|ग्राहक का नाम दर्ज करें
Enter a name|Weka jina|Saisissez un nom|أدخل اسمًا|Introduce un nombre|Digite um nome|Namen eingeben|Inserisci un nome|输入名称|नाम दर्ज करें
Enter a valid quantity|Weka idadi halali|Saisissez une quantité valide|أدخل كمية صالحة|Introduce una cantidad válida|Digite uma quantidade válida|Gültige Menge eingeben|Inserisci una quantità valida|输入有效数量|मान्य मात्रा दर्ज करें
Enter an amount|Weka kiasi|Saisissez un montant|أدخل مبلغًا|Introduce un importe|Digite um valor|Betrag eingeben|Inserisci un importo|输入金额|राशि दर्ज करें
Enter the counted cash|Weka taslimu zilizohesabiwa|Saisissez les espèces comptées|أدخل النقد المعدود|Introduce el efectivo contado|Digite o dinheiro contado|Gezähltes Bargeld eingeben|Inserisci i contanti contati|输入实点现金|गिनी गई नकदी दर्ज करें
Expected Cash|Taslimu zinazotarajiwa|Espèces attendues|النقد المتوقع|Efectivo esperado|Dinheiro esperado|Erwarteter Kassenbestand|Contanti previsti|应有现金|अपेक्षित नकदी
Expired|Imeisha muda|Périmé|منتهي الصلاحية|Caducado|Vencido|Abgelaufen|Scaduto|过期|समय-सीमा समाप्त
Fixed amount|Kiasi maalumu|Montant fixe|مبلغ ثابت|Importe fijo|Valor fixo|Fester Betrag|Importo fisso|固定金额|निश्चित राशि
From|Kutoka|De|من|Desde|De|Von|Da|从|से
Gross profit|Faida ghafi|Bénéfice brut|الربح الإجمالي|Beneficio bruto|Lucro bruto|Bruttogewinn|Utile lordo|毛利|सकल लाभ
History|Historia|Historique|السجل|Historial|Histórico|Verlauf|Cronologia|历史记录|इतिहास
Image|Picha|Image|صورة|Imagen|Imagem|Bild|Immagine|图片|छवि
Insufficient stock|Stoki haitoshi|Stock insuffisant|المخزون غير كافٍ|Stock insuficiente|Estoque insuficiente|Unzureichender Bestand|Scorte insufficienti|库存不足|अपर्याप्त स्टॉक
Inventory|Orodha ya bidhaa|Stock|المخزون|Inventario|Estoque|Inventar|Inventario|库存|इन्वेंट्री
Item not in sale|Bidhaa haipo kwenye mauzo|Article absent de la vente|الصنف غير موجود في عملية البيع|Artículo no incluido en la venta|Item não incluído na venda|Artikel nicht im Verkauf enthalten|Articolo non presente nella vendita|商品不在此销售单中|आइटम इस बिक्री में नहीं है
LOW|CHACHE|FAIBLE|منخفض|BAJO|BAIXO|NIEDRIG|BASSO|偏低|कम
Last 7 days|Siku 7 zilizopita|7 derniers jours|آخر 7 أيام|Últimos 7 días|Últimos 7 dias|Letzte 7 Tage|Ultimi 7 giorni|最近7天|पिछले 7 दिन
Last cash-up|Hesabu ya mwisho ya kufunga taslimu|Dernière clôture de caisse|آخر إقفال للصندوق|Último cierre de caja|Último fecho de caixa|Letzter Kassenabschluss|Ultima chiusura cassa|上次现金结账|पिछला नकदी मिलान
Lost|Imepotea|Perdu|مفقود|Perdido|Perdido|Verloren|Perso|丢失|खोया हुआ
Low / Out of Stock|Stoki chache / imeisha|Stock faible / épuisé|مخزون منخفض / نافد|Stock bajo / agotado|Estoque baixo / esgotado|Niedriger Bestand / ausverkauft|Scorte basse / esaurite|库存不足 / 缺货|कम स्टॉक / स्टॉक खत्म
Low stock|Stoki chache|Stock faible|مخزون منخفض|Stock bajo|Estoque baixo|Niedriger Bestand|Scorte basse|库存偏低|कम स्टॉक
Manual entry|Ingiza mwenyewe|Saisie manuelle|إدخال يدوي|Entrada manual|Entrada manual|Manuelle Eingabe|Inserimento manuale|手动输入|मैन्युअल प्रविष्टि
Mark received|Weka alama imepokelewa|Marquer comme reçu|وضع علامة تم الاستلام|Marcar como recibido|Marcar como recebido|Als empfangen markieren|Segna come ricevuto|标记为已接收|प्राप्त चिह्नित करें
Min stock|Kiwango cha chini cha stoki|Stock minimum|الحد الأدنى للمخزون|Stock mínimo|Estoque mínimo|Mindestbestand|Scorta minima|最低库存|न्यूनतम स्टॉक
Mixed|Mchanganyiko|Mixte|مختلط|Mixto|Misto|Gemischt|Misto|混合|मिश्रित
More details|Maelezo zaidi|Plus de détails|مزيد من التفاصيل|Más detalles|Mais detalhes|Weitere Details|Altri dettagli|更多详情|अधिक विवरण
Movement|Mabadiliko ya stoki|Mouvement|حركة المخزون|Movimiento|Movimentação|Bestandsbewegung|Movimento|库存变动|स्टॉक गतिविधि
Name is too long|Jina ni refu sana|Le nom est trop long|الاسم طويل جدًا|El nombre es demasiado largo|O nome é muito longo|Name ist zu lang|Il nome è troppo lungo|名称过长|नाम बहुत लंबा है
Net sales|Mauzo halisi|Ventes nettes|صافي المبيعات|Ventas netas|Vendas líquidas|Nettoumsatz|Vendite nette|净销售额|शुद्ध बिक्री
New|Mpya|Nouveau|جديد|Nuevo|Novo|Neu|Nuovo|新建|नया
New Transfer|Uhamisho mpya|Nouveau transfert|تحويل جديد|Nuevo traslado|Nova transferência|Neue Umlagerung|Nuovo trasferimento|新建调拨|नया स्थानांतरण
New brand|Chapa mpya|Nouvelle marque|علامة تجارية جديدة|Nueva marca|Nova marca|Neue Marke|Nuova marca|新建品牌|नया ब्रांड
New category|Kundi jipya|Nouvelle catégorie|فئة جديدة|Nueva categoría|Nova categoria|Neue Kategorie|Nuova categoria|新建分类|नई श्रेणी
New customer|Mteja mpya|Nouveau client|عميل جديد|Nuevo cliente|Novo cliente|Neuer Kunde|Nuovo cliente|新建客户|नया ग्राहक
No Customer|Hakuna mteja|Aucun client|لا يوجد عميل|Sin cliente|Sem cliente|Kein Kunde|Nessun cliente|无客户|कोई ग्राहक नहीं
No cash records yet|Bado hakuna rekodi za taslimu|Aucune écriture de caisse pour le moment|لا توجد سجلات نقدية بعد|Aún no hay registros de caja|Ainda não há registros de caixa|Noch keine Kasseneinträge|Nessun movimento di cassa|暂无现金记录|अभी कोई नकदी रिकॉर्ड नहीं
No customers yet|Bado hakuna wateja|Aucun client pour le moment|لا يوجد عملاء بعد|Aún no hay clientes|Ainda não há clientes|Noch keine Kunden|Nessun cliente ancora|暂无客户|अभी कोई ग्राहक नहीं
No matching products|Hakuna bidhaa zinazolingana|Aucun produit correspondant|لا توجد منتجات مطابقة|No hay productos coincidentes|Nenhum produto correspondente|Keine passenden Produkte|Nessun prodotto corrispondente|没有匹配的商品|कोई मेल खाता उत्पाद नहीं
No movements yet|Bado hakuna mabadiliko ya stoki|Aucun mouvement pour le moment|لا توجد حركات مخزون بعد|Aún no hay movimientos|Ainda não há movimentações|Noch keine Bestandsbewegungen|Nessun movimento ancora|暂无库存变动|अभी कोई स्टॉक गतिविधि नहीं
No payments yet|Bado hakuna malipo|Aucun paiement pour le moment|لا توجد مدفوعات بعد|Aún no hay pagos|Ainda não há pagamentos|Noch keine Zahlungen|Nessun pagamento ancora|暂无付款|अभी कोई भुगतान नहीं
No products yet|Bado hakuna bidhaa|Aucun produit pour le moment|لا توجد منتجات بعد|Aún no hay productos|Ainda não há produtos|Noch keine Produkte|Nessun prodotto ancora|暂无商品|अभी कोई उत्पाद नहीं
No products yet. Add products in Inventory.|Bado hakuna bidhaa. Ongeza bidhaa kwenye Orodha ya bidhaa.|Aucun produit pour le moment. Ajoutez des produits dans Stock.|لا توجد منتجات بعد. أضف منتجات في المخزون.|Aún no hay productos. Añade productos en Inventario.|Ainda não há produtos. Adicione produtos no Estoque.|Noch keine Produkte. Produkte im Inventar hinzufügen.|Nessun prodotto ancora. Aggiungi prodotti in Inventario.|暂无商品。请在库存中添加商品。|अभी कोई उत्पाद नहीं। इन्वेंट्री में उत्पाद जोड़ें।
No products yet. Add your first product to start tracking stock.|Bado hakuna bidhaa. Ongeza bidhaa yako ya kwanza kuanza kufuatilia stoki.|Aucun produit pour le moment. Ajoutez votre premier produit pour suivre le stock.|لا توجد منتجات بعد. أضف منتجك الأول لبدء تتبع المخزون.|Aún no hay productos. Añade tu primer producto para empezar a controlar el stock.|Ainda não há produtos. Adicione seu primeiro produto para acompanhar o estoque.|Noch keine Produkte. Erstes Produkt hinzufügen, um den Bestand zu verfolgen.|Nessun prodotto ancora. Aggiungi il primo prodotto per monitorare le scorte.|暂无商品。添加首个商品以开始跟踪库存。|अभी कोई उत्पाद नहीं। स्टॉक ट्रैक करना शुरू करने के लिए पहला उत्पाद जोड़ें।
No returns yet|Bado hakuna marejesho|Aucun retour pour le moment|لا توجد مرتجعات بعد|Aún no hay devoluciones|Ainda não há devoluções|Noch keine Rückgaben|Nessun reso ancora|暂无退货|अभी कोई वापसी नहीं
No sales yet|Bado hakuna mauzo|Aucune vente pour le moment|لا توجد مبيعات بعد|Aún no hay ventas|Ainda não há vendas|Noch keine Verkäufe|Nessuna vendita ancora|暂无销售|अभी कोई बिक्री नहीं
No transfers|Hakuna uhamisho|Aucun transfert|لا توجد تحويلات|No hay traslados|Nenhuma transferência|Keine Umlagerungen|Nessun trasferimento|暂无调拨|कोई स्थानांतरण नहीं
Not enough cash in the drawer|Taslimu kwenye droo hazitoshi|Pas assez d'espèces en caisse|لا يوجد نقد كافٍ في الدرج|No hay suficiente efectivo en la caja|Não há dinheiro suficiente na gaveta|Nicht genug Bargeld in der Kasse|Contanti insufficienti in cassa|钱箱现金不足|दराज में पर्याप्त नकदी नहीं है
Nothing here yet|Bado hakuna kitu hapa|Rien ici pour le moment|لا يوجد شيء هنا بعد|Aún no hay nada aquí|Ainda não há nada aqui|Hier ist noch nichts|Ancora nulla qui|暂无内容|अभी यहाँ कुछ नहीं है
OK|Sawa|OK|حسنًا|Aceptar|OK|OK|OK|确定|ठीक है
OPENING|UFUNGUZI|OUVERTURE|افتتاحي|APERTURA|ABERTURA|ERÖFFNUNG|APERTURA|期初|प्रारंभिक
OPENING CASH|TASLIMU ZA MWANZO|FONDS DE CAISSE INITIAL|النقد الافتتاحي|EFECTIVO INICIAL|DINHEIRO INICIAL|ANFANGSKASSENBESTAND|CONTANTI INIZIALI|期初现金|प्रारंभिक नकदी
OUT|IMETOKA|SORTIE|صادر|SALIDA|SAÍDA|AUSGANG|USCITA|出库|जावक
Opening Cash|Taslimu za mwanzo|Fonds de caisse initial|النقد الافتتاحي|Efectivo inicial|Dinheiro inicial|Anfangskassenbestand|Contanti iniziali|期初现金|प्रारंभिक नकदी
Original|Asili|Original|الأصل|Original|Original|Original|Originale|原始|मूल
Other|Nyingine|Autre|أخرى|Otro|Outro|Sonstiges|Altro|其他|अन्य
Out of stock|Stoki imeisha|Rupture de stock|نفد المخزون|Agotado|Esgotado|Ausverkauft|Esaurito|缺货|स्टॉक खत्म
Outstanding|Haijalipwa|Impayé|مستحق|Pendiente de pago|Por pagar|Offen|Da pagare|未付|बकाया
Outstanding balance|Salio linalodaiwa|Solde dû|الرصيد المستحق|Saldo pendiente|Saldo devedor|Offener Saldo|Saldo dovuto|未付余额|बकाया शेष
Over by|Ziada ya|Excédent de|زيادة بمقدار|Exceso de|Excedente de|Überschuss von|Eccedenza di|多出|अधिक राशि
Overview|Muhtasari|Vue d'ensemble|نظرة عامة|Resumen|Visão geral|Übersicht|Panoramica|概览|अवलोकन
Own use|Matumizi binafsi|Usage personnel|استخدام شخصي|Uso propio|Uso próprio|Eigenverbrauch|Uso personale|自用|निजी उपयोग
PENDING|INASUBIRI|EN ATTENTE|قيد الانتظار|PENDIENTE|PENDENTE|AUSSTEHEND|IN ATTESA|待处理|लंबित
PURCHASE|UNUNUZI|ACHAT|شراء|COMPRA|COMPRA|EINKAUF|ACQUISTO|采购|खरीद
Payment|Malipo|Paiement|دفعة|Pago|Pagamento|Zahlung|Pagamento|付款|भुगतान
Payment amounts can't be negative|Kiasi cha malipo hakiwezi kuwa hasi|Les montants des paiements ne peuvent pas être négatifs|لا يمكن أن تكون مبالغ الدفع سالبة|Los importes de pago no pueden ser negativos|Os valores de pagamento não podem ser negativos|Zahlungsbeträge dürfen nicht negativ sein|Gli importi dei pagamenti non possono essere negativi|付款金额不能为负数|भुगतान राशि ऋणात्मक नहीं हो सकती
Payment received|Malipo yamepokelewa|Paiement reçu|تم استلام الدفعة|Pago recibido|Pagamento recebido|Zahlung erhalten|Pagamento ricevuto|已收款|भुगतान प्राप्त
Payments|Malipo|Paiements|المدفوعات|Pagos|Pagamentos|Zahlungen|Pagamenti|付款|भुगतान
Payments exceed the total|Malipo yanazidi jumla|Les paiements dépassent le total|المدفوعات تتجاوز الإجمالي|Los pagos superan el total|Os pagamentos excedem o total|Zahlungen übersteigen den Gesamtbetrag|I pagamenti superano il totale|付款超过总额|भुगतान कुल राशि से अधिक है
Pending|Inasubiri|En attente|قيد الانتظار|Pendiente|Pendente|Ausstehend|In attesa|待处理|लंबित
Percentage|Asilimia|Pourcentage|نسبة مئوية|Porcentaje|Percentagem|Prozentsatz|Percentuale|百分比|प्रतिशत
Performance|Utendaji|Performance|الأداء|Rendimiento|Desempenho|Leistung|Prestazioni|业绩|प्रदर्शन
Performed by|Imefanywa na|Effectué par|نفّذه|Realizado por|Realizado por|Durchgeführt von|Eseguito da|操作人|द्वारा किया गया
Phone|Simu|Téléphone|الهاتف|Teléfono|Telefone|Telefon|Telefono|电话|फ़ोन
Physical count|Hesabu halisi|Comptage physique|الجرد الفعلي|Conteo físico|Contagem física|Istzählung|Conteggio fisico|实盘数量|वास्तविक गिनती
Physical stock count|Hesabu halisi ya stoki|Inventaire physique|الجرد الفعلي للمخزون|Conteo físico de existencias|Contagem física do estoque|Physische Bestandszählung|Inventario fisico|实物库存盘点|वास्तविक स्टॉक गणना
Potential profit|Faida inayowezekana|Bénéfice potentiel|الربح المحتمل|Beneficio potencial|Lucro potencial|Potenzieller Gewinn|Utile potenziale|潜在利润|संभावित लाभ
Previous|Iliyotangulia|Précédent|السابق|Anterior|Anterior|Zurück|Precedente|上一个|पिछला
Prices and quantity can't be negative|Bei na idadi haziwezi kuwa hasi|Les prix et la quantité ne peuvent pas être négatifs|لا يمكن أن تكون الأسعار والكمية سالبة|Los precios y la cantidad no pueden ser negativos|Os preços e a quantidade não podem ser negativos|Preise und Menge dürfen nicht negativ sein|Prezzi e quantità non possono essere negativi|价格和数量不能为负数|कीमतें और मात्रा ऋणात्मक नहीं हो सकतीं
Print|Chapisha|Imprimer|طباعة|Imprimir|Imprimir|Drucken|Stampa|打印|प्रिंट करें
Product|Bidhaa|Produit|منتج|Producto|Produto|Produkt|Prodotto|商品|उत्पाद
Product added|Bidhaa imeongezwa|Produit ajouté|تمت إضافة المنتج|Producto añadido|Produto adicionado|Produkt hinzugefügt|Prodotto aggiunto|商品已添加|उत्पाद जोड़ा गया
Product has an open transfer|Bidhaa ina uhamisho ambao haujakamilika|Le produit a un transfert en cours|للمنتج تحويل غير مكتمل|El producto tiene un traslado abierto|O produto tem uma transferência em aberto|Produkt hat eine offene Umlagerung|Il prodotto ha un trasferimento aperto|商品有未完成的调拨|उत्पाद का एक स्थानांतरण लंबित है
Product name|Jina la bidhaa|Nom du produit|اسم المنتج|Nombre del producto|Nome do produto|Produktname|Nome prodotto|商品名称|उत्पाद का नाम
Product name is required|Jina la bidhaa linahitajika|Le nom du produit est requis|اسم المنتج مطلوب|Se requiere el nombre del producto|O nome do produto é obrigatório|Produktname ist erforderlich|Il nome del prodotto è obbligatorio|必须填写商品名称|उत्पाद का नाम आवश्यक है
Product not found|Bidhaa haijapatikana|Produit introuvable|المنتج غير موجود|Producto no encontrado|Produto não encontrado|Produkt nicht gefunden|Prodotto non trovato|未找到商品|उत्पाद नहीं मिला
Products|Bidhaa|Produits|المنتجات|Productos|Produtos|Produkte|Prodotti|商品|उत्पाद
Purchase|Ununuzi|Achat|شراء|Compra|Compra|Einkauf|Acquisto|采购|खरीद
Quantity|Idadi|Quantité|الكمية|Cantidad|Quantidade|Menge|Quantità|数量|मात्रा
Quantity changes only through Stock In, Stock Out, Adjustments, sales and purchases.|Idadi hubadilika tu kupitia Stoki zinazoingia, Stoki zinazotoka, Marekebisho, mauzo na manunuzi.|La quantité ne change que via les entrées de stock, sorties de stock, ajustements, ventes et achats.|تتغير الكمية فقط عبر إدخال المخزون وإخراج المخزون والتسويات والمبيعات والمشتريات.|La cantidad solo cambia mediante entradas de stock, salidas de stock, ajustes, ventas y compras.|A quantidade só muda por entradas de estoque, saídas de estoque, ajustes, vendas e compras.|Die Menge ändert sich nur durch Wareneingänge, Warenausgänge, Korrekturen, Verkäufe und Einkäufe.|La quantità cambia solo tramite carichi, scarichi, rettifiche, vendite e acquisti.|数量仅通过入库、出库、调整、销售和采购变更。|मात्रा केवल स्टॉक आवक, स्टॉक जावक, समायोजन, बिक्री और खरीद से बदलती है।
Quantity must be more than 0|Idadi lazima iwe zaidi ya 0|La quantité doit être supérieure à 0|يجب أن تكون الكمية أكبر من 0|La cantidad debe ser mayor que 0|A quantidade deve ser maior que 0|Menge muss größer als 0 sein|La quantità deve essere maggiore di 0|数量必须大于0|मात्रा 0 से अधिक होनी चाहिए
RECEIVED|IMEPOKELEWA|REÇU|تم الاستلام|RECIBIDO|RECEBIDO|EMPFANGEN|RICEVUTO|已接收|प्राप्त
RETURN|MAREJESHO|RETOUR|إرجاع|DEVOLUCIÓN|DEVOLUÇÃO|RÜCKGABE|RESO|退货|वापसी
Reason|Sababu|Motif|السبب|Motivo|Motivo|Grund|Motivo|原因|कारण
Receipt|Risiti|Reçu|إيصال|Recibo|Recibo|Beleg|Ricevuta|收据|रसीद
Receipt copied|Risiti imenakiliwa|Reçu copié|تم نسخ الإيصال|Recibo copiado|Recibo copiado|Beleg kopiert|Ricevuta copiata|收据已复制|रसीद कॉपी की गई
Receive|Pokea|Recevoir|استلام|Recibir|Receber|Empfangen|Ricevi|接收|प्राप्त करें
Received|Imepokelewa|Reçu|تم الاستلام|Recibido|Recebido|Empfangen|Ricevuto|已接收|प्राप्त
Recent Adjustments|Marekebisho ya karibuni|Ajustements récents|التسويات الأخيرة|Ajustes recientes|Ajustes recentes|Letzte Korrekturen|Rettifiche recenti|最近调整|हाल के समायोजन
Recent Stock In|Stoki zilizoingia karibuni|Entrées de stock récentes|إدخالات المخزون الأخيرة|Entradas de stock recientes|Entradas de estoque recentes|Letzte Wareneingänge|Carichi recenti|最近入库|हाल की स्टॉक आवक
Recent Stock Out|Stoki zilizotoka karibuni|Sorties de stock récentes|إخراجات المخزون الأخيرة|Salidas de stock recientes|Saídas de estoque recentes|Letzte Warenausgänge|Scarichi recenti|最近出库|हाल की स्टॉक जावक
Recent sales|Mauzo ya karibuni|Ventes récentes|المبيعات الأخيرة|Ventas recientes|Vendas recentes|Letzte Verkäufe|Vendite recenti|最近销售|हाल की बिक्री
Recorded|Imerekodiwa|Enregistré|تم التسجيل|Registrado|Registrado|Erfasst|Registrato|已记录|दर्ज किया गया
Refund|Rejesha fedha|Remboursement|استرداد المبلغ|Reembolso|Reembolso|Rückerstattung|Rimborso|退款|धनवापसी
Refund as|Rejesha fedha kama|Rembourser sous forme de|الاسترداد على شكل|Reembolsar como|Reembolsar como|Erstatten als|Rimborsa come|退款方式|धनवापसी का तरीका
Remaining|Iliyobaki|Restant|المتبقي|Restante|Restante|Verbleibend|Rimanente|剩余|शेष
Remove|Ondoa|Retirer|إزالة|Quitar|Remover|Entfernen|Rimuovi|移除|निकालें
Reports|Ripoti|Rapports|التقارير|Informes|Relatórios|Berichte|Report|报表|रिपोर्ट
Reprint|Chapisha tena|Réimprimer|إعادة الطباعة|Reimprimir|Reimprimir|Erneut drucken|Ristampa|重新打印|फिर प्रिंट करें
Rest|Salio|Reste|الباقي|Resto|Restante|Rest|Resto|余下|बाकी
Return|Rudisha|Retour|إرجاع|Devolución|Devolução|Rückgabe|Reso|退货|वापसी
Return items|Rudisha bidhaa|Retourner des articles|إرجاع الأصناف|Devolver artículos|Devolver itens|Artikel zurückgeben|Restituisci articoli|退回商品|आइटम वापस करें
Return recorded|Marejesho yamerekodiwa|Retour enregistré|تم تسجيل الإرجاع|Devolución registrada|Devolução registrada|Rückgabe erfasst|Reso registrato|退货已记录|वापसी दर्ज की गई
Returned|Imerudishwa|Retourné|تم الإرجاع|Devuelto|Devolvido|Zurückgegeben|Restituito|已退货|वापस किया गया
Returns today|Marejesho ya leo|Retours du jour|مرتجعات اليوم|Devoluciones de hoy|Devoluções de hoje|Heutige Rückgaben|Resi di oggi|今日退货|आज की वापसी
SALE|MAUZO|VENTE|بيع|VENTA|VENDA|VERKAUF|VENDITA|销售|बिक्री
SCAN|CHANGANUA|SCANNER|مسح|ESCANEAR|LER CÓDIGO|SCANNEN|SCANSIONA|扫描|स्कैन करें
SENT|IMETUMWA|ENVOYÉ|تم الإرسال|ENVIADO|ENVIADO|GESENDET|INVIATO|已发送|भेजा गया
SKU|SKU|SKU|SKU|SKU|SKU|SKU|SKU|SKU|SKU
SKU already used|SKU tayari inatumika|SKU déjà utilisé|SKU مستخدم بالفعل|SKU ya utilizado|SKU já usado|SKU bereits verwendet|SKU già usato|SKU已被使用|SKU पहले से उपयोग में है
STOCK IN|STOKI ZINAZOINGIA|ENTRÉE DE STOCK|إدخال مخزون|ENTRADA DE STOCK|ENTRADA DE ESTOQUE|WARENEINGANG|CARICO MAGAZZINO|入库|स्टॉक आवक
STOCK OUT|STOKI ZINAZOTOKA|SORTIE DE STOCK|إخراج مخزون|SALIDA DE STOCK|SAÍDA DE ESTOQUE|WARENAUSGANG|SCARICO MAGAZZINO|出库|स्टॉक जावक
Sale completed|Mauzo yamekamilika|Vente terminée|اكتمل البيع|Venta completada|Venda concluída|Verkauf abgeschlossen|Vendita completata|销售已完成|बिक्री पूर्ण
Sale not found|Mauzo hayajapatikana|Vente introuvable|عملية البيع غير موجودة|Venta no encontrada|Venda não encontrada|Verkauf nicht gefunden|Vendita non trovata|未找到销售记录|बिक्री नहीं मिली
Sales|Mauzo|Ventes|المبيعات|Ventas|Vendas|Verkäufe|Vendite|销售|बिक्री
Save|Hifadhi|Enregistrer|حفظ|Guardar|Salvar|Speichern|Salva|保存|सहेजें
Saved|Imehifadhiwa|Enregistré|تم الحفظ|Guardado|Salvo|Gespeichert|Salvato|已保存|सहेजा गया
Scan barcode|Changanua msimbo pau|Scanner le code-barres|مسح الرمز الشريطي|Escanear código de barras|Ler código de barras|Barcode scannen|Scansiona codice a barre|扫描条形码|बारकोड स्कैन करें
Search product...|Tafuta bidhaa...|Rechercher un produit...|ابحث عن منتج...|Buscar producto...|Buscar produto...|Produkt suchen...|Cerca prodotto...|搜索商品...|उत्पाद खोजें...
Select a product|Chagua bidhaa|Sélectionnez un produit|اختر منتجًا|Selecciona un producto|Selecione um produto|Ein Produkt auswählen|Seleziona un prodotto|选择一个商品|एक उत्पाद चुनें
Select product|Chagua bidhaa|Sélectionner un produit|اختيار منتج|Seleccionar producto|Selecionar produto|Produkt auswählen|Seleziona prodotto|选择商品|उत्पाद चुनें
Sell|Uza|Vendre|بيع|Vender|Vender|Verkaufen|Vendi|出售|बेचें
Sell value|Thamani ya mauzo|Valeur de vente|قيمة البيع|Valor de venta|Valor de venda|Verkaufswert|Valore di vendita|销售价值|बिक्री मूल्य
Selling price|Bei ya kuuza|Prix de vente|سعر البيع|Precio de venta|Preço de venda|Verkaufspreis|Prezzo di vendita|售价|विक्रय मूल्य
Selling value|Thamani ya mauzo|Valeur de vente|قيمة البيع|Valor de venta|Valor de venda|Verkaufswert|Valore di vendita|销售价值|बिक्री मूल्य
Send|Tuma|Envoyer|إرسال|Enviar|Enviar|Senden|Invia|发送|भेजें
Sent|Imetumwa|Envoyé|تم الإرسال|Enviado|Enviado|Gesendet|Inviato|已发送|भेजा गया
Share|Shiriki|Partager|مشاركة|Compartir|Compartilhar|Teilen|Condividi|分享|साझा करें
Source|Chanzo|Source|المصدر|Origen|Origem|Quelle|Origine|来源|स्रोत
Status|Hali|Statut|الحالة|Estado|Estado|Status|Stato|状态|स्थिति
Stock|Stoki|Stock|المخزون|Stock|Estoque|Bestand|Scorte|库存|स्टॉक
Stock In|Stoki zinazoingia|Entrée de stock|إدخال مخزون|Entrada de stock|Entrada de estoque|Wareneingang|Carico magazzino|入库|स्टॉक आवक
Stock Levels|Viwango vya stoki|Niveaux de stock|مستويات المخزون|Niveles de stock|Níveis de estoque|Bestandsmengen|Livelli di scorta|库存水平|स्टॉक स्तर
Stock Out|Stoki zinazotoka|Sortie de stock|إخراج مخزون|Salida de stock|Saída de estoque|Warenausgang|Scarico magazzino|出库|स्टॉक जावक
Stock Report|Ripoti ya stoki|Rapport de stock|تقرير المخزون|Informe de stock|Relatório de estoque|Bestandsbericht|Report scorte|库存报表|स्टॉक रिपोर्ट
Stock value|Thamani ya stoki|Valeur du stock|قيمة المخزون|Valor del stock|Valor do estoque|Bestandswert|Valore delle scorte|库存价值|स्टॉक मूल्य
Subtotal|Jumla ndogo|Sous-total|المجموع الفرعي|Subtotal|Subtotal|Zwischensumme|Subtotale|小计|उप-योग
TOTAL|JUMLA|TOTAL|الإجمالي|TOTAL|TOTAL|GESAMT|TOTALE|总计|कुल
TRANSFER CANCEL|KUGHAIRI UHAMISHO|ANNULATION DE TRANSFERT|إلغاء تحويل|CANCELACIÓN DE TRASLADO|CANCELAMENTO DE TRANSFERÊNCIA|UMLAGERUNGSSTORNO|ANNULLAMENTO TRASFERIMENTO|调拨取消|स्थानांतरण रद्द
TRANSFER IN|UHAMISHO UNAOINGIA|TRANSFERT ENTRANT|تحويل وارد|TRASLADO ENTRANTE|TRANSFERÊNCIA DE ENTRADA|UMLAGERUNGSEINGANG|TRASFERIMENTO IN ENTRATA|调拨入库|स्थानांतरण आवक
TRANSFER OUT|UHAMISHO UNAOTOKA|TRANSFERT SORTANT|تحويل صادر|TRASLADO SALIENTE|TRANSFERÊNCIA DE SAÍDA|UMLAGERUNGSAUSGANG|TRASFERIMENTO IN USCITA|调拨出库|स्थानांतरण जावक
Thank you!|Asante!|Merci !|شكرًا لك!|¡Gracias!|Obrigado!|Vielen Dank!|Grazie!|谢谢！|धन्यवाद!
Till|Kasha la malipo|Caisse|صندوق النقد|Caja|Caixa|Kasse|Cassa|收银台|कैश काउंटर
To return items, open the original sale in Sales and tap Return items.|Ili kurudisha bidhaa, fungua mauzo ya awali kwenye Mauzo na uguse Rudisha bidhaa.|Pour retourner des articles, ouvrez la vente d'origine dans Ventes et appuyez sur Retourner des articles.|لإرجاع الأصناف، افتح عملية البيع الأصلية في المبيعات واضغط على إرجاع الأصناف.|Para devolver artículos, abre la venta original en Ventas y toca Devolver artículos.|Para devolver itens, abra a venda original em Vendas e toque em Devolver itens.|Zum Zurückgeben von Artikeln den ursprünglichen Verkauf unter Verkäufe öffnen und auf Artikel zurückgeben tippen.|Per restituire articoli, apri la vendita originale in Vendite e tocca Restituisci articoli.|如需退货，请在销售中打开原销售单，然后点击退回商品。|आइटम वापस करने के लिए बिक्री में मूल बिक्री खोलें और आइटम वापस करें पर टैप करें।
To shop / branch|Kwenda duka / tawi|Vers magasin / succursale|إلى المتجر / الفرع|A tienda / sucursal|Para loja / filial|An Geschäft / Filiale|Al negozio / filiale|目标门店 / 分店|गंतव्य दुकान / शाखा
Today|Leo|Aujourd'hui|اليوم|Hoy|Hoje|Heute|Oggi|今天|आज
Today's sales|Mauzo ya leo|Ventes du jour|مبيعات اليوم|Ventas de hoy|Vendas de hoje|Heutige Verkäufe|Vendite di oggi|今日销售|आज की बिक्री
Top products|Bidhaa zinazouzwa zaidi|Meilleures ventes|المنتجات الأكثر مبيعًا|Productos más vendidos|Produtos mais vendidos|Meistverkaufte Produkte|Prodotti più venduti|热销商品|सबसे अधिक बिकने वाले उत्पाद
Transactions|Miamala|Transactions|المعاملات|Transacciones|Transações|Transaktionen|Transazioni|交易|लेनदेन
Transfer can't be cancelled|Uhamisho hauwezi kughairiwa|Le transfert ne peut pas être annulé|لا يمكن إلغاء التحويل|No se puede cancelar el traslado|Não é possível cancelar a transferência|Umlagerung kann nicht storniert werden|Impossibile annullare il trasferimento|无法取消调拨|स्थानांतरण रद्द नहीं किया जा सकता
Transfer can't be sent|Uhamisho hauwezi kutumwa|Le transfert ne peut pas être envoyé|لا يمكن إرسال التحويل|No se puede enviar el traslado|Não é possível enviar a transferência|Umlagerung kann nicht gesendet werden|Impossibile inviare il trasferimento|无法发送调拨|स्थानांतरण भेजा नहीं जा सकता
Transfer created|Uhamisho umeundwa|Transfert créé|تم إنشاء التحويل|Traslado creado|Transferência criada|Umlagerung erstellt|Trasferimento creato|调拨已创建|स्थानांतरण बनाया गया
Transfers|Uhamisho|Transferts|التحويلات|Traslados|Transferências|Umlagerungen|Trasferimenti|调拨|स्थानांतरण
Unit|Kipimo|Unité|الوحدة|Unidad|Unidade|Einheit|Unità|单位|इकाई
Valuation|Uthamini|Valorisation|تقييم المخزون|Valoración|Avaliação|Bewertung|Valutazione|估值|मूल्यांकन
credit|mkopo|crédit|ائتمان|crédito|crédito|Kredit|credito|赊账|उधार
left|imebaki|restant|متبقٍ|restante|restante|übrig|rimanente|剩余|बाकी
out|imetoka|sortie|صادر|salida|saída|Ausgang|uscita|出库|जावक
pcs|vipande|pièces|قطع|uds.|unid.|Stk.|pz|件|नग
AI Reorder|Kuagiza tena kwa AI|Réapprovisionnement IA|إعادة الطلب بالذكاء الاصطناعي|Reposición con IA|Reposição com IA|KI-Nachbestellung|Riordino IA|AI补货|AI पुनः ऑर्डर
Shop data|Data za duka|Données du magasin|بيانات المتجر|Datos de la tienda|Dados da loja|Shopdaten|Dati del negozio|门店数据|दुकान का डेटा
Manual data|Data za kuingiza mwenyewe|Données manuelles|بيانات يدوية|Datos manuales|Dados manuais|Manuelle Daten|Dati manuali|手动数据|मैन्युअल डेटा
Units sold|Vipande vilivyouzwa|Unités vendues|الوحدات المباعة|Unidades vendidas|Unidades vendidas|Verkaufte Einheiten|Unità vendute|已售数量|बेची गई इकाइयाँ
Stock on hand|Stoki iliyopo|Stock disponible|المخزون المتاح|Stock disponible|Estoque disponível|Verfügbarer Bestand|Giacenza disponibile|现有库存|उपलब्ध स्टॉक
Incoming stock|Stoki inayokuja|Stock à recevoir|مخزون قادم|Stock entrante|Estoque a receber|Erwarteter Wareneingang|Scorte in arrivo|待入库库存|आने वाला स्टॉक
Sales period (days)|Kipindi cha mauzo (siku)|Période de vente (jours)|فترة المبيعات (أيام)|Período de ventas (días)|Período de vendas (dias)|Verkaufszeitraum (Tage)|Periodo di vendita (giorni)|销售周期（天）|बिक्री अवधि (दिन)
Supplier lead time (days)|Muda wa kusubiri msambazaji (siku)|Délai fournisseur (jours)|مهلة توريد المورد (أيام)|Plazo del proveedor (días)|Prazo do fornecedor (dias)|Lieferzeit des Lieferanten (Tage)|Tempo di consegna fornitore (giorni)|供应商交货期（天）|आपूर्तिकर्ता की आपूर्ति अवधि (दिन)
Stock cover (days)|Muda ambao stoki inatosha (siku)|Couverture de stock (jours)|تغطية المخزون (أيام)|Cobertura de stock (días)|Cobertura de estoque (dias)|Bestandsreichweite (Tage)|Copertura scorte (giorni)|库存可用天数（天）|स्टॉक पर्याप्तता (दिन)
Safety stock (days)|Stoki ya akiba (siku)|Stock de sécurité (jours)|مخزون الأمان (أيام)|Stock de seguridad (días)|Estoque de segurança (dias)|Sicherheitsbestand (Tage)|Scorta di sicurezza (giorni)|安全库存（天）|सुरक्षा स्टॉक (दिन)
Use shop data|Tumia data za duka|Utiliser les données du magasin|استخدام بيانات المتجر|Usar datos de la tienda|Usar dados da loja|Shopdaten verwenden|Usa i dati del negozio|使用门店数据|दुकान का डेटा उपयोग करें
Add row|Ongeza safu mlalo|Ajouter une ligne|إضافة صف|Añadir fila|Adicionar linha|Zeile hinzufügen|Aggiungi riga|添加行|पंक्ति जोड़ें
Recommend reorder|Pendekeza kuagiza tena|Recommander un réapprovisionnement|اقتراح إعادة الطلب|Recomendar reposición|Recomendar reposição|Nachbestellung empfehlen|Consiglia riordino|推荐补货|पुनः ऑर्डर का सुझाव दें
Analyzing stock…|Inachambua stoki…|Analyse du stock…|جارٍ تحليل المخزون…|Analizando stock…|Analisando estoque…|Bestand wird analysiert…|Analisi scorte…|正在分析库存…|स्टॉक का विश्लेषण हो रहा है…
Stop|Simamisha|Arrêter|إيقاف|Detener|Parar|Stoppen|Interrompi|停止|रोकें
Suggested quantity|Idadi iliyopendekezwa|Quantité suggérée|الكمية المقترحة|Cantidad sugerida|Quantidade sugerida|Empfohlene Menge|Quantità suggerita|建议数量|सुझाई गई मात्रा
Estimated cost|Gharama iliyokadiriwa|Coût estimé|التكلفة التقديرية|Coste estimado|Custo estimado|Geschätzte Kosten|Costo stimato|预计成本|अनुमानित लागत
Download CSV|Pakua CSV|Télécharger le CSV|تنزيل CSV|Descargar CSV|Baixar CSV|CSV herunterladen|Scarica CSV|下载CSV|CSV डाउनलोड करें
Review recommendations before ordering. No stock or purchases are changed.|Kagua mapendekezo kabla ya kuagiza. Hakuna stoki wala manunuzi yatakayobadilishwa.|Vérifiez les recommandations avant de commander. Aucun stock ni achat n'est modifié.|راجع التوصيات قبل الطلب. لا يتم تغيير أي مخزون أو مشتريات.|Revisa las recomendaciones antes de pedir. No se modifica el stock ni las compras.|Revise as recomendações antes de encomendar. Nenhum estoque ou compra é alterado.|Empfehlungen vor der Bestellung prüfen. Bestände und Einkäufe werden nicht geändert.|Controlla i consigli prima di ordinare. Scorte e acquisti non vengono modificati.|下单前请审核建议。不会更改任何库存或采购记录。|ऑर्डर देने से पहले सुझावों की समीक्षा करें। स्टॉक या खरीद में कोई बदलाव नहीं होता।
Sales and stock data will be sent to Lovable AI when you request recommendations.|Data za mauzo na stoki zitatumwa kwa Lovable AI unapoomba mapendekezo.|Les données de vente et de stock seront envoyées à Lovable AI lorsque vous demanderez des recommandations.|ستُرسل بيانات المبيعات والمخزون إلى Lovable AI عند طلب التوصيات.|Los datos de ventas y stock se enviarán a Lovable AI cuando solicites recomendaciones.|Os dados de vendas e estoque serão enviados ao Lovable AI quando solicitar recomendações.|Verkaufs- und Bestandsdaten werden an Lovable AI gesendet, wenn Sie Empfehlungen anfordern.|I dati di vendita e delle scorte saranno inviati a Lovable AI quando richiedi consigli.|请求建议时，销售和库存数据将发送至Lovable AI。|सुझाव माँगने पर बिक्री और स्टॉक डेटा Lovable AI को भेजा जाएगा।
Enter at least one product|Weka angalau bidhaa moja|Saisissez au moins un produit|أدخل منتجًا واحدًا على الأقل|Introduce al menos un producto|Digite pelo menos um produto|Mindestens ein Produkt eingeben|Inserisci almeno un prodotto|至少输入一个商品|कम से कम एक उत्पाद दर्ज करें
Enter valid non-negative quantities|Weka idadi halali zisizo hasi|Saisissez des quantités valides non négatives|أدخل كميات صالحة غير سالبة|Introduce cantidades válidas no negativas|Digite quantidades válidas não negativas|Gültige, nicht negative Mengen eingeben|Inserisci quantità valide non negative|输入有效的非负数量|मान्य गैर-ऋणात्मक मात्राएँ दर्ज करें
Enter a valid number of days|Weka idadi halali ya siku|Saisissez un nombre de jours valide|أدخل عدد أيام صالحًا|Introduce un número válido de días|Digite um número válido de dias|Gültige Anzahl von Tagen eingeben|Inserisci un numero valido di giorni|输入有效天数|दिनों की मान्य संख्या दर्ज करें
No recommendations returned|Hakuna mapendekezo yaliyorejeshwa|Aucune recommandation reçue|لم تُرجع أي توصيات|No se recibieron recomendaciones|Nenhuma recomendação recebida|Keine Empfehlungen erhalten|Nessun consiglio ricevuto|未返回建议|कोई सुझाव प्राप्त नहीं हुआ
AI request failed|Ombi la AI limeshindwa|Échec de la requête IA|فشل طلب الذكاء الاصطناعي|Error en la solicitud a la IA|Falha na solicitação à IA|KI-Anfrage fehlgeschlagen|Richiesta IA non riuscita|AI请求失败|AI अनुरोध विफल
Reorder|Agiza tena|Réapprovisionner|إعادة الطلب|Reponer|Repor|Nachbestellen|Riordina|补货|पुनः ऑर्डर करें
Advice only|Ushauri pekee|À titre indicatif uniquement|للاسترشاد فقط|Solo orientativo|Apenas orientação|Nur als Empfehlung|Solo indicativo|仅供参考|केवल सलाह
Paid|Imelipwa|Payé|مدفوع|Pagado|Pago|Bezahlt|Pagato|已付款|भुगतान किया गया
Dashboard|Dashibodi|Tableau de bord|لوحة التحكم|Panel|Painel|Dashboard|Dashboard|仪表盘|डैशबोर्ड
Purchases|Manunuzi|Achats|المشتريات|Compras|Compras|Einkäufe|Acquisti|采购|खरीद
Expenses|Matumizi|Dépenses|المصروفات|Gastos|Despesas|Ausgaben|Spese|支出|खर्च
Profit|Faida|Bénéfice|الربح|Beneficio|Lucro|Gewinn|Utile|利润|लाभ
Not available yet|Bado haipatikani|Pas encore disponible|غير متاح بعد|Aún no disponible|Ainda não disponível|Noch nicht verfügbar|Non ancora disponibile|暂不可用|अभी उपलब्ध नहीं
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
