<?php
/**
 * Plugin Name:       Quiz Embed
 * Description:       Pasang quiz dari aplikasi Quiz: tempel link embed di editor (oEmbed) atau pakai shortcode [quiz slug="…"]. Bisa mengirim nama pengguna WordPress yang login lewat embed token.
 * Version:           1.0.0
 * Requires at least: 5.9
 * Requires PHP:      7.4
 * License:           MIT
 * Text Domain:       quiz-embed
 *
 * Desain: docs/07-embed.md (oEmbed & WordPress, identitas pengguna) di repositori aplikasi.
 */

if (!defined('ABSPATH')) {
	exit;
}

const QUIZ_EMBED_OPTION = 'quiz_embed_settings';
const QUIZ_EMBED_TOKEN_TTL = 3000; // detik; server menerima maksimal 1 jam.

/** @return array{app_url: string, secrets: string, identify_users: bool} */
function quiz_embed_settings(): array {
	$saved = get_option(QUIZ_EMBED_OPTION, array());
	$saved = is_array($saved) ? $saved : array();
	return array(
		'app_url'        => isset($saved['app_url']) ? (string) $saved['app_url'] : '',
		'secrets'        => isset($saved['secrets']) ? (string) $saved['secrets'] : '',
		'identify_users' => !empty($saved['identify_users']),
	);
}

/** Origin aplikasi Quiz tanpa garis miring di akhir, atau '' jika belum diatur dengan benar. */
function quiz_embed_app_url(): string {
	$url = untrailingslashit(trim(quiz_embed_settings()['app_url']));
	return preg_match('~^https?://[^/\s?#]+$~i', $url) ? $url : '';
}

function quiz_embed_valid_slug(string $slug): bool {
	return (bool) preg_match('/^[a-z0-9-]{1,80}$/', $slug);
}

// ─── oEmbed ───────────────────────────────────────────────────────────────────
// Provider yang didaftarkan dianggap tepercaya, jadi WordPress tidak memberi iframe atribut
// sandbox. Tanpa plugin ini, WordPress menemukan provider lewat discovery lalu men-sandbox
// iframe, dan quiz tidak bisa menyimpan progres peserta.

add_action('init', function () {
	$app = quiz_embed_app_url();
	if ($app !== '') {
		wp_oembed_add_provider($app . '/embed/*', $app . '/api/oembed', false);
	}
});

// ─── Shortcode [quiz slug="kuis-hewan" theme="dark" session="123456" title="…"] ───────────
// Memakai loader embed.js: tinggi iframe menyesuaikan isi, dan identitas pengguna bisa dikirim.

/** Embed secret untuk slug ini dari pengaturan ("slug=secret" per baris). */
function quiz_embed_secret_for(string $slug): string {
	foreach (preg_split('/\r\n|\r|\n/', quiz_embed_settings()['secrets']) as $line) {
		$parts = explode('=', trim($line), 2);
		if (count($parts) === 2 && trim($parts[0]) === $slug) {
			return trim($parts[1]);
		}
	}
	return '';
}

function quiz_embed_b64url(string $data): string {
	return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

/** Embed token HS256 untuk pengguna yang login (docs/07-embed.md#identitas-pengguna), atau ''. */
function quiz_embed_token(string $slug): string {
	if (!quiz_embed_settings()['identify_users'] || !is_user_logged_in()) {
		return '';
	}
	$secret = quiz_embed_secret_for($slug);
	if ($secret === '') {
		return '';
	}
	$user   = wp_get_current_user();
	$name   = trim((string) $user->display_name);
	$claims = array(
		'sub'  => 'wp:' . $user->ID,
		'quiz' => $slug,
		'exp'  => time() + QUIZ_EMBED_TOKEN_TTL,
	);
	if ($name !== '') {
		$claims['name'] = function_exists('mb_substr') ? mb_substr($name, 0, 60) : substr($name, 0, 60);
	}
	$header  = quiz_embed_b64url(wp_json_encode(array('alg' => 'HS256', 'typ' => 'JWT')));
	$payload = quiz_embed_b64url(wp_json_encode($claims));
	$sig     = quiz_embed_b64url(hash_hmac('sha256', $header . '.' . $payload, $secret, true));
	return $header . '.' . $payload . '.' . $sig;
}

add_shortcode('quiz', function ($atts) {
	$atts = shortcode_atts(
		array('slug' => '', 'theme' => '', 'session' => '', 'title' => ''),
		$atts,
		'quiz'
	);
	$app  = quiz_embed_app_url();
	$slug = strtolower(trim((string) $atts['slug']));
	if ($app === '' || !quiz_embed_valid_slug($slug)) {
		return current_user_can('edit_posts')
			? '<p><em>' . esc_html__('Quiz: isi URL aplikasi di Pengaturan → Quiz, dan pastikan slug benar.', 'quiz-embed') . '</em></p>'
			: '';
	}

	wp_enqueue_script('quiz-embed-loader', $app . '/embed.js', array(), null, array('strategy' => 'async', 'in_footer' => true));

	$attributes = array('data-quiz' => $slug);
	if (in_array($atts['theme'], array('light', 'dark'), true)) {
		$attributes['data-theme'] = $atts['theme'];
	}
	if (preg_match('/^\d{6}$/', (string) $atts['session'])) {
		$attributes['data-session'] = $atts['session'];
	}
	if ($atts['title'] !== '') {
		$attributes['data-title'] = (string) $atts['title'];
	}
	$token = quiz_embed_token($slug);
	if ($token !== '') {
		$attributes['data-token'] = $token;
	}

	$html = '<div';
	foreach ($attributes as $name => $value) {
		$html .= ' ' . $name . '="' . esc_attr($value) . '"';
	}
	return $html . '></div>';
});

// Halaman berisi token pribadi tidak boleh di-cache untuk semua pengunjung.
add_action('template_redirect', function () {
	if (quiz_embed_settings()['identify_users'] && is_user_logged_in() && is_singular()) {
		$post = get_post();
		if ($post && has_shortcode($post->post_content, 'quiz')) {
			nocache_headers();
		}
	}
});

// ─── Pengaturan → Quiz ────────────────────────────────────────────────────────

add_action('admin_init', function () {
	register_setting('quiz_embed', QUIZ_EMBED_OPTION, array(
		'type'              => 'array',
		'sanitize_callback' => function ($input) {
			$input = is_array($input) ? $input : array();
			return array(
				'app_url'        => esc_url_raw(untrailingslashit(trim((string) ($input['app_url'] ?? '')))),
				'secrets'        => sanitize_textarea_field((string) ($input['secrets'] ?? '')),
				'identify_users' => !empty($input['identify_users']),
			);
		},
		'default'           => array(),
	));
});

add_action('admin_menu', function () {
	add_options_page('Quiz', 'Quiz', 'manage_options', 'quiz-embed', 'quiz_embed_settings_page');
});

function quiz_embed_settings_page(): void {
	if (!current_user_can('manage_options')) {
		return;
	}
	$settings = quiz_embed_settings();
	$site     = wp_parse_url(home_url());
	$origin   = ($site['scheme'] ?? 'https') . '://' . ($site['host'] ?? '') . (isset($site['port']) ? ':' . $site['port'] : '');
	?>
	<div class="wrap">
		<h1>Quiz</h1>
		<p>
			Tambahkan <code><?php echo esc_html($origin); ?></code> ke daftar domain di
			<strong>Bagikan → Embed</strong> pada setiap quiz yang ingin dipasang di situs ini.
		</p>
		<form method="post" action="options.php">
			<?php settings_fields('quiz_embed'); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="quiz-embed-app-url">URL aplikasi Quiz</label></th>
					<td>
						<input id="quiz-embed-app-url" class="regular-text code" type="url"
							name="<?php echo esc_attr(QUIZ_EMBED_OPTION); ?>[app_url]"
							value="<?php echo esc_attr($settings['app_url']); ?>"
							placeholder="https://quiz.sekolah.id" />
						<p class="description">
							Setelah diisi, tempel link embed (<code>…/embed/slug-quiz</code>) di editor, atau pakai
							<code>[quiz slug="slug-quiz"]</code>.
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Identitas pengguna</th>
					<td>
						<label>
							<input type="checkbox" name="<?php echo esc_attr(QUIZ_EMBED_OPTION); ?>[identify_users]"
								value="1" <?php checked($settings['identify_users']); ?> />
							Kirim nama pengguna WordPress yang login (shortcode saja)
						</label>
						<p class="description">
							Peserta langsung masuk dengan namanya, dan laporan guru menampilkan identitas asli.
							Butuh embed secret quiz di bawah.
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="quiz-embed-secrets">Embed secret</label></th>
					<td>
						<textarea id="quiz-embed-secrets" class="large-text code" rows="5"
							name="<?php echo esc_attr(QUIZ_EMBED_OPTION); ?>[secrets]"
							placeholder="kuis-hewan=secret-dari-panel-embed"><?php echo esc_textarea($settings['secrets']); ?></textarea>
						<p class="description">
							Satu baris per quiz: <code>slug=secret</code>. Secret dibuat di
							<strong>Bagikan → Embed → Buat secret</strong>. Jangan dibagikan.
						</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}
